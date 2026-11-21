/**
 * dsh-session-changes：会话级改动账本。
 *
 * DSH 自带的 `workspace-changes` 只按「顶层会话 × 单个轮次」记录，且摘要只活在
 * Host 内存里；team-dev 的成员是子代理，edits 会被它的 `eligible()` 直接排除，
 * 所以会话结束时往往只剩最后一轮、甚至完全没有改动卡片。
 *
 * 本插件补的是「会话级、跨 agent、可查询」的账本：
 *  - 监听全局 `fs/write-intent` / `fs/edit-intent` / `fs/delete-intent`，
 *    不区分顶层还是子代理，按 subagent 树的根 Session 归档；
 *  - 通过 `session/event` 的 `turn/start` 记住每个 Session 的当前轮次；
 *  - 暴露只读 `GET /api/dsh-session-changes/summary?sessionId=<root>`，
 *    供客户端在 turn tail 渲染「本会话累计改动」卡片。
 *
 * 设计约束：
 *  - 只读接口、`cache-control: no-store`，不写宿主状态；
 *  - 账本异常绝不阻塞工具调用（所有记录路径都包在 try/catch 里）；
 *  - 不 import 宿主私有模块，只通过 `ctx` 服务访问能力；
 *  - 先做内存账本，持久化（`.dsh/session-changes/*.json`）留到下一版。
 */
import { isAbsolute, resolve } from 'node:path'

/** 插件名，写进每个成功响应的 `plugin` 字段。 */
const PLUGIN_NAME = 'dsh-session-changes'

/** 本插件所有路由的公共前缀。 */
const PREFIX = '/api/dsh-session-changes'

/** Session id 白名单：只允许 URL 安全字符做路由查询参数。 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

/** 单次响应最多返回的文件数，避免超大团队把响应撑爆。 */
const MAX_FILES = 500

export const name = PLUGIN_NAME
export const inject = []

/**
 * 从上下文里安全读取一个服务；未挂载时返回 undefined，异常也不外抛。
 * @param {any} ctx - Cordis 上下文（或测试假对象）。
 * @param {string} serviceName - 服务名。
 * @returns {any} 服务实例或 undefined。
 */
function safeGet(ctx, serviceName) {
  if (ctx === null || ctx === undefined) return undefined
  try {
    if (typeof ctx.get === 'function') {
      const service = ctx.get(serviceName)
      if (service !== undefined) return service
    }
  } catch {
    // Cordis 对未注册属性的访问可能抛错，降级为 undefined。
  }
  try {
    return ctx[serviceName]
  } catch {
    return undefined
  }
}

/**
 * 解析 Agent 所属 subagent 树的根；`subagents` 晚于本插件挂载时惰性读取。
 * @param {any} ctx - 上下文。
 * @param {any} agent - Agent 实例。
 * @returns {any} 根 Agent（缺失时退化为自身）。
 */
function rootOfAgent(ctx, agent) {
  const subagents = safeGet(ctx, 'subagents')
  if (subagents !== null && subagents !== undefined && typeof subagents.rootOf === 'function') {
    try {
      return subagents.rootOf(agent) ?? agent
    } catch {
      return agent
    }
  }
  return agent
}

/**
 * fs intent 的 `actor` 是工具执行对象（workspace-changes 用 `exec` 作 key），
 * 不是 Agent 本身；优先取它引用的 Agent，其次才把 actor 当 Agent/Session。
 * @param {any} actor - fs intent actor。
 * @returns {any} Agent 或原 actor。
 */
function actorAgent(actor) {
  if (actor === null || actor === undefined) return actor
  if (typeof actor === 'object') {
    if (actor.agent !== null && typeof actor.agent === 'object') return actor.agent
    if (actor.session !== null && typeof actor.session === 'object') return actor
  }
  return actor
}

/**
 * Agent 对应的 Session（Agent 自身也可能被当作 Session 传入）。
 * @param {any} actor - Agent / Session。
 * @returns {any} Session 或 undefined。
 */
function sessionOf(actor) {
  if (actor === null || actor === undefined) return undefined
  return actor.session ?? actor
}

/**
 * Session id；Agent / Session 两种形态都接受。
 * @param {any} actor - Agent / Session。
 * @returns {string|undefined} 字符串 id。
 */
function sessionIdOf(actor) {
  const session = sessionOf(actor)
  const id = session?.id ?? actor?.id
  return id === undefined || id === null ? undefined : String(id)
}

/**
 * Session 的工作目录（用于把相对路径归一为绝对路径）。
 * @param {any} actor - Agent / Session。
 * @returns {string|undefined} cwd。
 */
function cwdOf(actor) {
  const session = sessionOf(actor)
  return session?.header?.cwd ?? session?.cwd ?? undefined
}

/**
 * 判断一个字符串是否像 Session id，避免把它当作成员展示名。
 * @param {unknown} value - 待判断值。
 * @returns {boolean} 是否像 Session id。
 */
function looksLikeSessionId(value) {
  if (typeof value !== 'string') return false
  if (/^session[-_]/i.test(value)) return true
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/**
 * 展示用 agent 名。Lead 没有可用名字时显示 Lead，而不是把 session id 抄进卡片；
 * 子代理没有可用名字时显示 Member。这样同一行不会反复出现 `session-...`。
 * @param {any} actor - Agent。
 * @param {any} root - subagent 树根。
 * @returns {string} 名字。
 */
function agentNameOf(actor, root) {
  const name = actor?.name
  if (typeof name === 'string' && name.length > 0 && !looksLikeSessionId(name)) return name
  const actorId = sessionIdOf(actor)
  const rootId = sessionIdOf(root)
  if (actor === root || (actorId !== undefined && actorId === rootId)) return 'Lead'
  const id = actor?.id
  if (typeof id === 'string' && id.length > 0 && !looksLikeSessionId(id)) return id
  return 'Member'
}

/**
 * 把 fs target 解析为路径字符串。优先用宿主的 `fs.processPath`，
 * 其次是 target 上常见的路径字段，最后退化为字符串本身。
 * @param {any} ctx - 上下文。
 * @param {any} target - fs target。
 * @returns {string|undefined} 路径。
 */
function processTarget(ctx, target) {
  if (target === null || target === undefined) return undefined
  try {
    const fs = safeGet(ctx, 'fs')
    if (fs !== null && fs !== undefined && typeof fs.processPath === 'function') {
      const value = fs.processPath(target)
      if (typeof value === 'string' && value.length > 0) return value
    }
  } catch {
    // 继续尝试 target 自身字段。
  }
  if (typeof target === 'string') return target.length > 0 ? target : undefined
  for (const key of ['path', 'filePath', 'file', 'absolutePath']) {
    const value = target[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/**
 * 把相对路径按 cwd 归一为绝对路径。
 * @param {string|undefined} cwd - 根 Session 工作目录。
 * @param {string|undefined} path - 原始路径。
 * @returns {string|undefined} 绝对路径。
 */
function absolutePath(cwd, path) {
  if (typeof path !== 'string' || path.length === 0) return undefined
  try {
    if (isAbsolute(path)) return path
    if (cwd === undefined || cwd === null || cwd === '') return path
    return resolve(cwd, path)
  } catch {
    return path
  }
}

/**
 * 创建一个内存账本。纯数据、无 IO，便于单测。
 * @returns {{
 *   record: (sessionId: string, cwd: string|undefined, entry: {path: string, agent?: string, turn?: number, deleted?: boolean}) => void,
 *   summary: (sessionId: string) => object|null,
 *   clear: () => void,
 *   roots: Map<string, object>,
 * }} 账本。
 */
export function createLedger() {
  const roots = new Map()

  /**
   * 取或创建某个根 Session 的账本。
   * @param {string} sessionId - 根 Session id。
   * @param {string|undefined} cwd - 工作目录。
   * @returns {object} 根账本。
   */
  function ensure(sessionId, cwd) {
    let root = roots.get(sessionId)
    if (root === undefined) {
      root = {
        sessionId,
        cwd,
        updatedAt: Date.now(),
        latestTurn: 0,
        files: new Map(),
      }
      roots.set(sessionId, root)
    } else if (root.cwd === undefined && cwd !== undefined) {
      root.cwd = cwd
    }
    return root
  }

  /**
   * 记录一次文件变更（同一路径去重，累计编辑次数、agent 与轮次）。
   * @param {string} sessionId - 根 Session id。
   * @param {string|undefined} cwd - 工作目录。
   * @param {{path: string, agent?: string, turn?: number, deleted?: boolean}} entry - 变更。
   * @returns {void}
   */
  function record(sessionId, cwd, entry) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return
    if (entry === null || entry === undefined || typeof entry.path !== 'string' || entry.path.length === 0) return
    const root = ensure(sessionId, cwd)
    const turn = Number.isFinite(entry.turn) && entry.turn > 0 ? entry.turn : 0
    const agent = typeof entry.agent === 'string' && entry.agent.length > 0 ? entry.agent : undefined
    const deleted = entry.deleted === true
    const file = root.files.get(entry.path)
    if (file === undefined) {
      root.files.set(entry.path, {
        path: entry.path,
        agents: new Set(agent === undefined ? [] : [agent]),
        turns: new Set(turn > 0 ? [turn] : []),
        edits: 1,
        deleted,
      })
    } else {
      file.edits += 1
      if (agent !== undefined) file.agents.add(agent)
      if (turn > 0) file.turns.add(turn)
      if (deleted) file.deleted = true
    }
    root.updatedAt = Date.now()
  }

  /**
   * 读某个根 Session 的摘要；不存在时返回 null。
   * @param {string} sessionId - 根 Session id。
   * @returns {object|null} 摘要。
   */
  function summary(sessionId) {
    const root = roots.get(sessionId)
    return root === undefined ? null : summarizeLedger(root)
  }

  /** 清空账本（插件卸载时调用）。 */
  function clear() {
    roots.clear()
  }

  /**
   * 记住根 Session 最新开始的一轮；即使该轮没有文件改动，收尾卡片也要能挂到它。
   * @param {string} sessionId - 根 Session id。
   * @param {number} turn - 轮次。
   * @returns {void}
   */
  function touchTurn(sessionId, turn) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return
    if (!Number.isFinite(turn) || turn <= 0) return
    const root = ensure(sessionId, undefined)
    if (turn > (root.latestTurn ?? 0)) {
      root.latestTurn = turn
      root.updatedAt = Date.now()
    }
  }

  return { record, touchTurn, summary, clear, roots }
}

/**
 * 把根账本压成稳定、可 JSON 序列化的摘要；按最后修改轮次倒序、路径升序排序。
 * @param {object} root - 根账本。
 * @returns {object} 摘要。
 */
export function summarizeLedger(root) {
  const files = []
  for (const file of root.files.values()) {
    files.push({
      path: file.path,
      agents: [...file.agents].filter(Boolean).sort(),
      turns: [...file.turns].sort((left, right) => left - right),
      edits: file.edits,
      deleted: file.deleted === true,
    })
  }
  files.sort((left, right) => {
    const leftTurn = left.turns.length > 0 ? left.turns[left.turns.length - 1] : 0
    const rightTurn = right.turns.length > 0 ? right.turns[right.turns.length - 1] : 0
    if (rightTurn !== leftTurn) return rightTurn - leftTurn
    return left.path.localeCompare(right.path)
  })
  const edits = files.reduce((sum, file) => sum + file.edits, 0)
  return {
    plugin: PLUGIN_NAME,
    sessionId: root.sessionId,
    updatedAt: root.updatedAt,
    latestTurn: Number.isFinite(root.latestTurn) && root.latestTurn > 0 ? root.latestTurn : 0,
    total: files.length,
    edits,
    files: files.slice(0, MAX_FILES),
  }
}

/**
 * 构造 JSON 响应（只读数据禁止缓存）。
 * @param {unknown} payload - 响应体。
 * @param {number} [status] - HTTP 状态码。
 * @returns {Response} 响应。
 */
function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

/**
 * 注册只读摘要路由。`connection.fetch` 缺失时静默跳过，插件继续加载。
 * @param {any} connectionCtx - 已注入 connection 的上下文。
 * @param {ReturnType<typeof createLedger>} ledger - 账本。
 * @returns {void}
 */
export function registerRoutes(connectionCtx, ledger) {
  const connection = safeGet(connectionCtx, 'connection')
  const registry = connection?.fetch
  if (registry === null || registry === undefined || typeof registry.register !== 'function') return

  /**
   * `GET /api/dsh-session-changes/summary?sessionId=<root>`。
   * @param {Request|undefined} request - 请求。
   * @returns {Promise<Response>} 摘要 / 400。
   */
  const handler = async request => {
    let sessionId = null
    try {
      sessionId = new URL(request?.url ?? '', 'http://localhost').searchParams.get('sessionId')
    } catch {
      sessionId = null
    }
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      return json({ error: 'invalid-session-id' }, 400)
    }
    const summary = ledger.summary(sessionId)
    if (summary === null) {
      return json({ plugin: PLUGIN_NAME, sessionId, updatedAt: null, latestTurn: 0, total: 0, edits: 0, files: [] })
    }
    return json(summary)
  }

  let dispose
  try {
    dispose = registry.register({
      path: `${PREFIX}/summary`,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: handler,
    })
  } catch {
    // 路径冲突等异常：不阻塞插件加载。
    return
  }
  try {
    if (connectionCtx !== null && connectionCtx !== undefined && typeof connectionCtx.effect === 'function') {
      connectionCtx.effect(() => () => {
        if (typeof dispose === 'function') dispose()
      }, 'dsh-session-changes: summary route')
    }
  } catch {
    // 上下文不支持 effect 时放弃自动清理；路由仍可用。
  }
}

/**
 * 插件入口：安装全局 fs intent 钩子、轮次跟踪与只读路由。
 * @param {any} ctx - Cordis 插件上下文。
 * @param {object} [config] - 预留配置（当前无选项）。
 * @returns {void}
 */
export function apply(ctx, config = {}) {
  if (ctx === null || typeof ctx !== 'object') return
  const ledger = createLedger()
  const turns = new Map()

  /**
   * 把一次 fs intent 记到根 Session 的账本里；任何异常都不得影响工具调用。
   * @param {any} target - fs target。
   * @param {any} actor - 发起变更的 Agent。
   * @param {boolean} deleted - 是否为删除。
   * @returns {void}
   */
  function record(target, actor, deleted) {
    try {
      if (actor === null || actor === undefined) return
      const rawPath = processTarget(ctx, target)
      if (rawPath === undefined) return
      const agent = actorAgent(actor)
      const session = sessionOf(agent)
      if (session === undefined || session === null || session.id === undefined) return
      const root = rootOfAgent(ctx, agent)
      const rootId = sessionIdOf(root)
      if (rootId === undefined) return
      const actorId = sessionIdOf(agent)
      const turn = actorId === undefined ? undefined : turns.get(actorId)
      const rootCwd = cwdOf(root)
      const agentCwd = cwdOf(agent) ?? rootCwd
      ledger.record(rootId, rootCwd, {
        path: absolutePath(agentCwd, rawPath),
        agent: agentNameOf(agent, root),
        turn: turn ?? 0,
        deleted: deleted === true,
      })
    } catch {
      // 账本是旁路能力：记录失败不能阻塞写入。
    }
  }

  /**
   * fs intent 钩子：先让下游完成，再记账；不改变下游决策。
   * @param {boolean} deleted - 是否为删除。
   * @returns {(target: any, actor: any, next: () => Promise<any>) => Promise<any>} 钩子。
   */
  const intentHook = deleted => async (target, actor, next) => {
    const decision = await next()
    if (decision === undefined || decision === null || decision.kind !== 'deny') {
      record(target, actor, deleted)
    }
    return decision
  }

  try {
    ctx.on('fs/write-intent', intentHook(false), { prepend: true })
    ctx.on('fs/edit-intent', intentHook(false), { prepend: true })
    ctx.on('fs/delete-intent', intentHook(true), { prepend: true })
  } catch {
    // 旧宿主没有 fs intent 钩子：插件仍可加载，只是账本为空。
  }

  try {
    ctx.on('session/event', (session, event) => {
      if (event?.type === 'turn/start') {
        const turn = event.data?.turn
        if (Number.isFinite(turn)) {
          turns.set(session.id, turn)
          const header = session?.header
          const isRootSession = header === undefined || (header.origin !== 'subagent' && (header.delegationDepth ?? 0) === 0)
          if (isRootSession) ledger.touchTurn(session.id, turn)
        }
      }
    })
    ctx.on('session/disposed', session => {
      turns.delete(session.id)
    })
  } catch {
    // 没有 session 事件时轮次记为 0，不影响文件列表。
  }

  try {
    if (typeof ctx.inject === 'function') {
      ctx.inject(['connection'], connectionCtx => {
        try {
          registerRoutes(connectionCtx, ledger)
        } catch {
          // 路由注册失败不影响账本。
        }
      })
    } else if (safeGet(ctx, 'connection') !== undefined) {
      registerRoutes(ctx, ledger)
    }
  } catch {
    // connection 缺失时静默降级。
  }

  try {
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => () => {
        ledger.clear()
        turns.clear()
      }, 'dsh-session-changes: ledger')
    }
  } catch {
    // 上下文不支持 effect 时不做自动清理。
  }

  console.error('[dsh-session-changes] session change ledger installed')
}
