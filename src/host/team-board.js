/**
 * dsh-team-dev host 半侧：团队看板只读数据接口。
 *
 * 需求来源：team-out/design.md §2（host 接口设计）与 §5 归属表。本文件只做三件事：
 *  1) `teamBoardApply(ctx)`：可选注入 `connection`，注册只读 GET 路由（无该服务时静默跳过）；
 *  2) `buildTeamsSnapshot` / `buildTeamDetail`：纯函数，把 Agent Teams 服务的数据映射为看板模型；
 *  3) 降级：`connection` / `agentTeams` 缺失或探测失败时返回 `degraded:true`，插件照常加载。
 *
 * 约束：
 *  - 零新增运行时依赖，不 import 宿主私有模块（只通过 `ctx` 服务访问宿主能力）；
 *  - 只读：仅 GET、不修改宿主状态、日志不记录任务正文、响应一律 `cache-control: no-store`；
 *  - 纯函数与 IO 分离：路由 handler 只做探测与组装，数据映射全在导出的纯函数里（便于 tester 用 fake 单测）。
 *
 * 与 design §2.4 的唯一已知偏差（源码优先）：
 *  `connection.fetch` 的路由匹配是「精确 pathname 等值匹配」
 *  （`packages/client/connection/src/rpc-host.ts:122,128`），不支持 `/teams/:teamId` 这类动态段。
 *  因此单团队路由由本模块在每次团队列表请求时按真实 teamId **惰性注册精确路径**
 *  （对客户端而言仍是 design 约定的 `/api/dsh-team-dev/teams/<teamId>`），
 *  并额外提供 `/api/dsh-team-dev/teams?teamId=<teamId>` 作为无状态兜底。已上报 Lead。
 */

/** 插件名，写进每个成功响应的 `plugin` 字段。 */
const PLUGIN_NAME = 'dsh-team-dev'

/** 本插件所有路由的公共前缀（参考 dev-workbench/dsh/server.js:16 的 PREFIX 写法）。 */
const PREFIX = '/api/dsh-team-dev'

/** teamId 格式白名单：仅允许 URL 安全字符，防止拼接异常路径（对齐 design §2.4）。 */
const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

/** 看板三列的任务状态（`deleted` 不展示）。 */
const TASK_STATUSES = ['pending', 'in_progress', 'completed']

/** 只读数据禁止缓存。 */
const NO_STORE_HEADERS = { 'cache-control': 'no-store' }

/**
 * 构造 JSON 响应（与 dev-workbench/dsh/server.js:50-51 的 `Response.json` 写法一致）。
 * @param {unknown} payload - 可 JSON 序列化的响应体。
 * @param {number} [status] - HTTP 状态码。
 * @returns {Response} 带 no-store 的响应。
 */
function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { ...NO_STORE_HEADERS } })
}

/**
 * 从上下文里安全读取一个服务（`ctx.get` 在服务未挂载时返回 undefined，异常也不能外抛）。
 * @param {any} ctx - Cordis 上下文（或测试假对象）。
 * @param {string} name - 服务名。
 * @returns {any} 服务实例或 undefined。
 */
function safeGet(ctx, name) {
  if (ctx === null || ctx === undefined) return undefined
  try {
    if (typeof ctx.get === 'function') {
      const service = ctx.get(name)
      if (service !== undefined) return service
    }
  } catch {
    // Cordis 对未注册属性的访问可能抛错，降级为 undefined。
  }
  try {
    return ctx[name]
  } catch {
    return undefined
  }
}

/**
 * 安全调用一次可能抛错的同步取值（Agent Teams 的 stale identity 必须被跳过）。
 * @param {() => any} run - 取值函数。
 * @param {any} fallback - 失败或空值时的兜底。
 * @returns {any} 取值结果。
 */
function safeCall(run, fallback) {
  try {
    const value = run()
    return value === undefined || value === null ? fallback : value
  } catch {
    return fallback
  }
}

/**
 * 归一化 Agent 来源：接受 `ctx.agents` 注册表或 Agent 数组。
 * @param {any} agents - AgentRegistry（有 list()）或 Agent[]。
 * @returns {any[]} Agent 快照数组（永不抛错）。
 */
function agentList(agents) {
  if (Array.isArray(agents)) return agents.slice()
  if (agents !== null && agents !== undefined && typeof agents.list === 'function') {
    const list = safeCall(() => agents.list(), [])
    return Array.isArray(list) ? list.slice() : []
  }
  return []
}

/**
 * 读取 Agent 的会话/线程 id；注册表保证 `agent.id === agent.session.id`（core/agent:470-471）。
 * @param {any} agent - Agent 实例。
 * @returns {string|undefined} 字符串 id。
 */
function agentSessionId(agent) {
  try {
    const id = agent?.id ?? agent?.session?.id
    return id === undefined || id === null ? undefined : String(id)
  } catch {
    return undefined
  }
}

/**
 * 探测 `agentTeams` 服务（**每次请求时**探测：服务可能在本插件 apply 之后才挂载，
 * 与 guard.ts:124-135 的惰性探测同一模式）。
 * @param {any} ctx - 上下文。
 * @returns {{service?: any, reason?: string}} 命中时带 service，否则带降级原因。
 */
function probeTeamService(ctx) {
  try {
    const service = safeGet(ctx, 'agentTeams')
    if (service === undefined || service === null) return { reason: 'agent-teams-unavailable' }
    if (typeof service.tryMembership !== 'function') return { reason: 'agent-teams-unavailable' }
    return { service }
  } catch {
    return { reason: 'probe-failed' }
  }
}

/**
 * 统计三列任务数（`deleted` 一律过滤，未知状态忽略）。
 * @param {any[]} tasks - TeamTaskView 数组。
 * @returns {{pending:number,in_progress:number,completed:number}} 列计数。
 */
function countTasks(tasks) {
  const counts = { pending: 0, in_progress: 0, completed: 0 }
  if (!Array.isArray(tasks)) return counts
  for (const task of tasks) {
    const status = task?.status
    if (status === 'deleted') continue
    if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1
  }
  return counts
}

/**
 * 列表页成员行：只保留 id/name/role/status，控制列表体积（design §2.4）。
 * @param {any} member - TeamMemberView。
 * @returns {{id:string,name:string,role:string,status:string}} 精简行。
 */
function slimMember(member) {
  return {
    id: String(member?.id ?? ''),
    name: String(member?.name ?? ''),
    role: member?.role === 'lead' ? 'lead' : 'teammate',
    status: member?.status ?? 'inactive',
  }
}

/**
 * 详情页成员行：TeamMemberView 全量透传（浅拷贝 + diagnostics 数组脱离服务实例）。
 * @param {any} member - TeamMemberView。
 * @returns {object} 全量成员行。
 */
function cloneMember(member) {
  return {
    ...member,
    diagnostics: Array.isArray(member?.diagnostics) ? [...member.diagnostics] : [],
  }
}

/**
 * 详情页任务行：TeamTaskView 全量透传（数组字段脱离服务实例，保持 JSON 安全）。
 * @param {any} task - TeamTaskView。
 * @returns {object} 全量任务行。
 */
function cloneTask(task) {
  return {
    ...task,
    blockedBy: Array.isArray(task?.blockedBy) ? [...task.blockedBy] : [],
    writeScopes: Array.isArray(task?.writeScopes) ? [...task.writeScopes] : [],
    writeScopeWarnings: Array.isArray(task?.writeScopeWarnings) ? [...task.writeScopeWarnings] : [],
  }
}

/**
 * 枚举团队：对每个在线 Agent 做 `tryMembership`（单个异常/无成员关系就跳过），
 * 按 `membership.id`（= root SessionId）分组，再从每组 root 取 roster 与任务板。
 * @param {any} agentTeams - TeamService（至少实现 tryMembership/listMembers/listTasks）。
 * @param {any} agents - AgentRegistry 或 Agent 数组。
 * @returns {Array<{teamId:string,rootAgent:any,membership:any,discovered:number,members:any[],tasks:any[]}>}
 *   按 teamId 稳定排序的团队内部结构；members/tasks 取数失败时为空数组。
 */
function collectTeams(agentTeams, agents) {
  const groups = new Map()
  const canProbe = agentTeams !== null && agentTeams !== undefined && typeof agentTeams.tryMembership === 'function'

  for (const agent of agentList(agents)) {
    if (!canProbe) break
    let membership
    try {
      membership = agentTeams.tryMembership(agent)
    } catch {
      // stale identity 等异常：跳过该 Agent，不影响其余团队（design §2.6）。
      continue
    }
    if (membership === undefined || membership === null || membership.id === undefined) continue
    const teamId = String(membership.id)
    const existing = groups.get(teamId)
    if (existing === undefined) {
      groups.set(teamId, {
        teamId,
        rootAgent: membership.root ?? agent,
        membership,
        discovered: 1,
        members: [],
        tasks: [],
      })
    } else {
      existing.discovered += 1
      // 以 Lead 的 membership.root 为准（多个 teammate 上报同一 root 时保持幂等）。
      if (membership.role === 'lead' && membership.root !== undefined) existing.rootAgent = membership.root
    }
  }

  const list = [...groups.values()].sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0))
  for (const group of list) {
    // 参数是 Agent（不是 sessionId）；服务调用失败时降级为空板，团队仍可见。
    group.members = safeCall(() => agentTeams.listMembers(group.rootAgent), [])
    group.tasks = safeCall(() => agentTeams.listTasks(group.rootAgent), [])
    if (!Array.isArray(group.members)) group.members = []
    if (!Array.isArray(group.tasks)) group.tasks = []
  }
  return list
}

/**
 * 团队展示名：优先 roster 中 role=lead 的行，其次 membership.name，最后兜底 'lead'。
 * @param {any} group - collectTeams 的内部结构。
 * @returns {string} Lead 名称。
 */
function leadNameOf(group) {
  const lead = group.members.find?.(member => member?.role === 'lead')
  return lead?.name ?? group.membership?.name ?? group.rootAgent?.name ?? 'lead'
}

/**
 * 纯函数：由 Agent Teams 服务与 Agent 注册表组装 `/teams` 列表。
 * @param {any} agentTeams - TeamService（fake 对象需实现 tryMembership/listMembers/listTasks）。
 * @param {any} agents - AgentRegistry 或 Agent 数组。
 * @returns {Array<object>} 团队摘要列表：teamId/leadName/leadSessionId/memberCount/taskCounts/members。
 */
export function buildTeamsSnapshot(agentTeams, agents) {
  return collectTeams(agentTeams, agents).map(group => {
    const members = group.members.filter(Boolean).map(slimMember)
    return {
      teamId: group.teamId,
      leadName: leadNameOf(group),
      leadSessionId: agentSessionId(group.rootAgent) ?? group.teamId,
      // roster 取数失败时退化为「探测到的成员 Agent 数」，避免展示 0 人团队。
      memberCount: members.length > 0 ? members.length : group.discovered,
      taskCounts: countTasks(group.tasks),
      members,
    }
  })
}

/**
 * 纯函数：由 Agent Teams 服务与 Agent 注册表组装单个团队的看板详情。
 * @param {any} agentTeams - TeamService（fake 对象需实现 tryMembership/listMembers/listTasks）。
 * @param {any} agents - AgentRegistry 或 Agent 数组。
 * @param {string} teamId - 目标团队 id（TeamId = root SessionId）。
 * @returns {object|null} 团队详情；该 teamId 不属于任何在线团队时返回 null（路由层映射为 404）。
 */
export function buildTeamDetail(agentTeams, agents, teamId) {
  const wanted = teamId === undefined || teamId === null ? '' : String(teamId)
  const group = collectTeams(agentTeams, agents).find(candidate => candidate.teamId === wanted)
  if (group === undefined) return null
  const members = group.members.filter(Boolean).map(cloneMember)
  const tasks = group.tasks.filter(task => task?.status !== 'deleted').map(cloneTask)
  return {
    teamId: group.teamId,
    leadName: leadNameOf(group),
    members,
    tasks,
    taskCounts: countTasks(tasks),
  }
}

/**
 * 从请求 URL 读取 `?teamId=`（兜底接口用；Request.url 应为绝对地址）。
 * @param {Request|undefined} request - 路由请求。
 * @returns {string|null} teamId 查询值；无该参数时 null。
 */
function queryTeamId(request) {
  const rawUrl = request?.url
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return null
  try {
    return new URL(rawUrl, 'http://localhost').searchParams.get('teamId')
  } catch {
    return null
  }
}

/**
 * 注册本插件的只读路由。调用方须保证 `connection.fetch` 已存在；
 * 缺少 `connection.fetch.register` 时直接返回，不抛错（插件继续加载）。
 * @param {any} connectionCtx - 已注入 connection 的上下文（`ctx.inject(['connection'], cb)` 的 cb 参数）。
 * @returns {void}
 */
export function registerRoutes(connectionCtx) {
  const connection = safeGet(connectionCtx, 'connection')
  const fetchRegistry = connection?.fetch
  if (fetchRegistry === null || fetchRegistry === undefined || typeof fetchRegistry.register !== 'function') {
    return
  }

  /** 已注册的单团队精确路由：teamId -> dispose（undefined 表示注册失败，避免重复重试）。 */
  const detailDisposers = new Map()

  /**
   * 单团队详情响应（供精确路径路由与 `?teamId=` 兜底共用）。
   * @param {string} rawTeamId - 原始 teamId。
   * @returns {Promise<Response>} 200 详情 / 400 格式错误 / 404 团队不存在 / 200 降级。
   */
  const detailResponse = async rawTeamId => {
    if (typeof rawTeamId !== 'string' || !TEAM_ID_PATTERN.test(rawTeamId)) {
      return json({ error: 'invalid-team-id' }, 400)
    }
    try {
      const probe = probeTeamService(connectionCtx)
      if (probe.service === undefined) {
        // 服务不可用不是「团队不存在」：返回 200 + degraded，客户端展示空态。
        return json({ plugin: PLUGIN_NAME, degraded: true, reason: probe.reason, team: null })
      }
      const team = buildTeamDetail(probe.service, safeGet(connectionCtx, 'agents'), rawTeamId)
      if (team === null) return json({ error: 'team-not-found' }, 404)
      return json({ plugin: PLUGIN_NAME, degraded: false, team })
    } catch {
      return json({ plugin: PLUGIN_NAME, degraded: true, reason: 'probe-failed', team: null })
    }
  }

  /**
   * 按当前在线团队惰性注册精确路径路由，并清理已消失团队的旧路由。
   * 说明：connection.fetch 只做精确 pathname 匹配，动态段 `:teamId` 不会被解析，
   * 因此这里为每个真实 teamId 注册一条 `/teams/<teamId>` 路由，保持客户端契约不变。
   * @param {string[]} teamIds - 本次快照中的团队 id。
   * @returns {void}
   */
  const syncDetailRoutes = teamIds => {
    const live = new Set(teamIds)
    for (const [teamId, dispose] of detailDisposers) {
      if (live.has(teamId)) continue
      detailDisposers.delete(teamId)
      if (typeof dispose === 'function') {
        try {
          dispose()
        } catch {
          // 卸载失败不影响主流程。
        }
      }
    }
    for (const teamId of live) {
      if (detailDisposers.has(teamId) || !TEAM_ID_PATTERN.test(teamId)) continue
      let dispose
      try {
        dispose = fetchRegistry.register({
          path: `${PREFIX}/teams/${teamId}`,
          methods: ['GET'],
          requestBody: 'buffered',
          async fetch() {
            return await detailResponse(teamId)
          },
        })
      } catch {
        // 路径被占用等异常：保留 Map 记录（undefined）以避免每次请求重试；查询参数兜底仍可用。
        dispose = undefined
      }
      detailDisposers.set(teamId, typeof dispose === 'function' ? dispose : undefined)
    }
  }

  /**
   * 团队列表： `GET /api/dsh-team-dev/teams`；
   * 兼容兜底：`GET /api/dsh-team-dev/teams?teamId=<id>` 等价于单团队详情。
   * @param {Request|undefined} request - 路由请求。
   * @returns {Promise<Response>} 列表 / 详情 / 降级响应。
   */
  const listHandler = async request => {
    const requested = queryTeamId(request)
    if (requested !== null) return await detailResponse(requested)
    try {
      const probe = probeTeamService(connectionCtx)
      if (probe.service === undefined) {
        return json({ plugin: PLUGIN_NAME, degraded: true, reason: probe.reason, teams: [] })
      }
      const teams = buildTeamsSnapshot(probe.service, safeGet(connectionCtx, 'agents'))
      syncDetailRoutes(teams.map(team => team.teamId))
      return json({ plugin: PLUGIN_NAME, degraded: false, reason: null, teams })
    } catch {
      // 探测/组装异常统一降级，保证看板可用且不把异常泄漏给本机接口。
      return json({ plugin: PLUGIN_NAME, degraded: true, reason: 'probe-failed', teams: [] })
    }
  }

  /** 已注册路由的清理函数；插件卸载时统一释放（若上下文支持 effect）。 */
  const disposers = []

  try {
    const disposeList = fetchRegistry.register({
      path: `${PREFIX}/teams`,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: listHandler,
    })
    if (typeof disposeList === 'function') disposers.push(disposeList)
  } catch {
    // 注册失败（路径冲突）：不抛错，避免阻塞插件加载；详情兜底路由也一并放弃。
    return
  }

  const cleanup = () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        // 卸载失败不影响主流程。
      }
    }
    for (const dispose of detailDisposers.values()) {
      if (typeof dispose !== 'function') continue
      try {
        dispose()
      } catch {
        // 同上。
      }
    }
    detailDisposers.clear()
  }

  try {
    // 路由随 connection 注入作用域释放：插件卸载/服务重建时自动注销，避免重复注册。
    if (connectionCtx !== null && connectionCtx !== undefined && typeof connectionCtx.effect === 'function') {
      connectionCtx.effect(() => () => cleanup())
    }
  } catch {
    // 上下文不支持 effect 时放弃自动清理；路由仍可用。
  }
}

/**
 * host 半侧入口：由组合入口 `src/index.js` 调用（Lead 负责接线）。
 *
 * 顶层 inject 不变（仍为 `['agents','skills']`），这里用可选注入：
 * - `connection` 缺失 → 不注册任何路由，插件照常加载；
 * - `agentTeams` 不注入，改为每次请求时探测（服务可能延迟挂载）；
 * - 无 `inject` 方法的旧宿主/测试桩 → 直接探测一次 connection 兜底。
 * @param {any} ctx - Cordis 插件上下文。
 * @returns {void}
 */
export function teamBoardApply(ctx) {
  if (ctx === null || typeof ctx !== 'object') return
  try {
    if (typeof ctx.inject === 'function') {
      ctx.inject(['connection'], connectionCtx => {
        try {
          registerRoutes(connectionCtx)
        } catch {
          // 注册阶段任何异常都不得阻塞插件加载（design §2.1/§2.6）。
        }
      })
      return
    }
    // 兜底：无 inject 的宿主（测试桩）只做一次同步探测。
    if (safeGet(ctx, 'connection') !== undefined) registerRoutes(ctx)
  } catch {
    // 可选服务探测失败：插件照常加载。
  }
}
