/**
 * 看板数据请求封装：同源只读 GET、请求可取消、错误归一化。
 *
 * 路由由 host 半侧 `src/host/team-board.js` 注册；PREFIX 必须与其保持一致。
 * 客户端只做读操作，不提供任何写接口。
 */

/** host 路由前缀（与 src/host/team-board.js 的 PREFIX 一致）。 */
const PREFIX = '/api/dsh-team-dev'

/** 轮询间隔：design §4.4 定 5s。 */
export const POLL_INTERVAL_MS = 5000

/** 连续失败后的退避间隔：5s → 15s → 30s，成功后复位（design §4.4）。 */
export const BACKOFF_MS = [5000, 15000, 30000]

/** 看板三列的状态值（对应 TeamTaskView.status）。 */
export const TASK_STATUSES = ['pending', 'in_progress', 'completed']

/** 接口错误：保留 HTTP 状态，供调用方区分 404 与网络错误。 */
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * 发一个同源只读请求。
 * @param path - 以 `/` 开头的接口路径。
 * @param options - 可选的 `signal`（AbortController）。
 * @returns 解析后的 JSON；HTTP 非 2xx 抛 ApiError。
 */
async function request(path, { signal } = {}) {
  let response
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal })
  } catch (error) {
    // AbortError 由调用方识别并静默；其余连接失败归一化为可展示的错误。
    if (error && error.name === 'AbortError') throw error
    throw new ApiError('无法连接本机接口，请确认 dsh-team-dev 已加载。', 0)
  }
  let data = null
  try {
    data = await response.json()
  } catch {
    // 非 JSON 响应（例如代理错误页）按无数据处下发。
    data = null
  }
  if (!response.ok) {
    const message = data && typeof data.error === 'string'
      ? data.error
      : `请求失败（HTTP ${response.status}）。`
    throw new ApiError(message, response.status)
  }
  return data
}

/**
 * 读团队列表。
 * @param options - 可选的 `signal`。
 * @returns `{ plugin, degraded, reason, teams }`。
 */
export function fetchTeams({ signal } = {}) {
  return request(`${PREFIX}/teams`, { signal })
}

/**
 * 读单个团队的看板数据。
 *
 * host 的 connection.fetch 是精确 pathname 匹配，动态段依赖 host 首次列表请求时
 * 惰性注册；因此先走 `/teams/<id>` 精确路径，失败（404 或网络错误）再回退
 * `/teams?teamId=<id>` 查询兜底，两次都失败时抛原始错误供上层回退第一个团队。
 * @param teamId - 团队 id（root SessionId），会被 URL 编码。
 * @param options - 可选的 `signal`。
 * @returns `{ plugin, degraded, team }`。
 */
export async function fetchTeam(teamId, { signal } = {}) {
  const id = encodeURIComponent(teamId)
  try {
    return await request(`${PREFIX}/teams/${id}`, { signal })
  } catch (error) {
    if (error && error.name === 'AbortError') throw error
    try {
      return await request(`${PREFIX}/teams?teamId=${id}`, { signal })
    } catch (fallbackError) {
      if (fallbackError && fallbackError.name === 'AbortError') throw fallbackError
      // 兜底也失败时保留第一次的错误语义（404 优先），让上层决定是否回退团队。
      throw error
    }
  }
}

/**
 * 团队是否属于某个会话：teamId 命中或任一成员 id 命中（design §3.2 默认算法第 1 步）。
 * @param team - /teams 返回的团队列表项。
 * @param sessionId - 当前会话 id（可能为空）。
 * @returns 是否命中。
 */
export function teamMatchesSession(team, sessionId) {
  if (!team || !sessionId) return false
  if (team.teamId === sessionId || team.leadSessionId === sessionId) return true
  const members = Array.isArray(team.members) ? team.members : []
  return members.some(member => Boolean(member) && member.id === sessionId)
}

/**
 * 默认团队选择（design §3.2）：
 * 1. 当前会话命中的团队；2. 上次选择仍在列表；3. 第一个团队。
 * 用户手动选择后（manual=true）不被默认算法覆盖。
 * @param teams - /teams 返回的团队列表。
 * @param sessionId - 当前会话 id。
 * @param lastSelectedId - 上次选中的团队 id。
 * @param manual - 是否为用户手动选择且该团队仍然存在。
 * @returns 选中的 teamId；列表为空时为 null。
 */
export function pickTeamId(teams, sessionId, lastSelectedId, manual = false) {
  const list = Array.isArray(teams) ? teams : []
  if (list.length === 0) return null
  if (!manual) {
    const current = list.find(team => teamMatchesSession(team, sessionId))
    if (current) return current.teamId
  }
  if (lastSelectedId && list.some(team => team.teamId === lastSelectedId)) return lastSelectedId
  return list[0].teamId
}

/**
 * 团队 id 的短展示形式：前 8 位（v0.2 不虚构 title，design §2.3）。
 * @param teamId - 团队 id。
 * @returns 短 id。
 */
export function shortTeamId(teamId) {
  const text = typeof teamId === 'string' ? teamId : ''
  return text.length > 8 ? text.slice(0, 8) : text
}

/**
 * 任务计数求和（列表项 `taskCounts`）。
 * @param taskCounts - `{ pending, in_progress, completed }`。
 * @returns 任务总数。
 */
export function taskTotal(taskCounts) {
  if (!taskCounts || typeof taskCounts !== 'object') return 0
  return TASK_STATUSES.reduce((sum, status) => sum + (Number(taskCounts[status]) || 0), 0)
}

/**
 * 按状态把任务分组到三列，过滤 deleted（design §2.5）。
 * @param tasks - TeamTaskView 数组。
 * @returns `{ pending, in_progress, completed }` 三个数组。
 */
export function groupTasks(tasks) {
  const groups = { pending: [], in_progress: [], completed: [] }
  const list = Array.isArray(tasks) ? tasks : []
  for (const task of list) {
    if (!task || task.status === 'deleted') continue
    if (groups[task.status]) groups[task.status].push(task)
  }
  return groups
}
