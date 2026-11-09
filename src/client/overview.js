/**
 * 「全部团队」总览视图的纯函数：统计、状态、排序、筛选。
 *
 * 输入全部来自 `/api/dsh-team-dev/teams` 的列表项（无 workspace/title/最后活动字段，
 * 所以这里只用 leadName、teamId、members、taskCounts 这些真实可用字段）。
 * 纯函数与渲染分离，便于 node --test 单测（不含 React）。
 */
import { shortTeamId, taskTotal } from './api.js'

/** 总览的状态筛选值。 */
export const OVERVIEW_FILTERS = ['all', 'active', 'pending', 'done']
/** 总览的排序值（服务端返回顺序不作数，这里始终给出确定性顺序）。 */
export const OVERVIEW_SORTS = ['active', 'total', 'name']

/**
 * 团队任务计数归一化。
 * @param team - /teams 返回的团队列表项。
 * @returns `{ pending, in_progress, completed, total }`，缺失字段按 0 处理。
 */
export function teamCounts(team) {
  const counts = team && team.taskCounts && typeof team.taskCounts === 'object' ? team.taskCounts : {}
  const pending = Number(counts.pending) || 0
  const inProgress = Number(counts.in_progress) || 0
  const completed = Number(counts.completed) || 0
  return { pending, in_progress: inProgress, completed, total: pending + inProgress + completed }
}

/**
 * 团队进度：完成百分比（0–100，四舍五入）。
 * @param team - 团队列表项。
 * @returns `{ completed, total, percent }`；total 为 0 时 percent 为 0。
 */
export function teamProgress(team) {
  const counts = teamCounts(team)
  const percent = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0
  return { completed: counts.completed, total: counts.total, percent }
}

/**
 * 团队状态：进行中 / 待开始 / 已完成（用于徽标与筛选）。
 * @param team - 团队列表项。
 * @returns 'active' | 'pending' | 'done'。
 */
export function teamState(team) {
  const counts = teamCounts(team)
  if (counts.in_progress > 0) return 'active'
  if (counts.pending > 0) return 'pending'
  return 'done'
}

/**
 * 总览统计条：在线团队数、任务总数、进行中、已完成。
 * @param teams - 团队列表。
 * @returns `{ teams, tasks, inProgress, completed }`。
 */
export function overviewSummary(teams) {
  const list = Array.isArray(teams) ? teams : []
  let tasks = 0
  let inProgress = 0
  let completed = 0
  for (const team of list) {
    const counts = teamCounts(team)
    tasks += counts.total
    inProgress += counts.in_progress
    completed += counts.completed
  }
  return { teams: list.length, tasks, inProgress, completed }
}

/**
 * 团队的展示标题：Lead 名 + 短 teamId（v0.2 不虚构团队标题）。
 * @param team - 团队列表项。
 * @returns 标题字符串。
 */
export function teamDisplayName(team) {
  const lead = team && typeof team.leadName === 'string' && team.leadName.length > 0 ? team.leadName : 'lead'
  return `${lead} · ${shortTeamId(team && team.teamId)}`
}

/**
 * 团队成员的缩写（首字符，最多 2 个字符用于中文/英文）。
 * @param member - 团队列表项 members 的成员。
 * @returns 缩写；没有名字时返回 '?'。
 */
export function memberInitial(member) {
  const name = member && typeof member.name === 'string' ? member.name.trim() : ''
  if (name.length === 0) return '?'
  const chars = Array.from(name)
  return chars.length > 1 && /[A-Za-z]/.test(chars[0]) ? chars.slice(0, 1).join('').toUpperCase() : chars[0].toUpperCase()
}

/**
 * 按状态与搜索词筛选团队。
 * @param teams - 团队列表。
 * @param filter - OVERVIEW_FILTERS 之一。
 * @param query - 搜索词（匹配 Lead 名或 teamId，大小写不敏感）。
 * @returns 新数组（不修改入参）。
 */
export function filterTeams(teams, filter = 'all', query = '') {
  const list = Array.isArray(teams) ? teams : []
  const needle = typeof query === 'string' ? query.trim().toLowerCase() : ''
  return list.filter(team => {
    if (filter !== 'all' && teamState(team) !== filter) return false
    if (needle === '') return true
    const lead = team && typeof team.leadName === 'string' ? team.leadName.toLowerCase() : ''
    const id = team && typeof team.teamId === 'string' ? team.teamId.toLowerCase() : ''
    return lead.includes(needle) || id.includes(needle)
  })
}

/**
 * 确定性排序：主键按所选维度，统一用 teamId 升序做 tie-breaker。
 * @param teams - 团队列表。
 * @param sort - OVERVIEW_SORTS 之一。
 * @returns 新数组（不修改入参）。
 */
export function sortTeams(teams, sort = 'active') {
  const list = Array.isArray(teams) ? teams : []
  const byId = (left, right) => String(left && left.teamId).localeCompare(String(right && right.teamId))
  const sorted = list.slice()
  sorted.sort((left, right) => {
    let primary = 0
    if (sort === 'total') {
      primary = teamCounts(right).total - teamCounts(left).total
    } else if (sort === 'name') {
      primary = teamDisplayName(left).localeCompare(teamDisplayName(right))
    } else {
      // 默认：进行中任务多的团队排前面（多团队并行时先看最忙的）。
      primary = teamCounts(right).in_progress - teamCounts(left).in_progress
    }
    return primary !== 0 ? primary : byId(left, right)
  })
  return sorted
}

/**
 * 总览的完整处理管线：筛选 → 排序。
 * @param teams - 团队列表。
 * @param options - `{ filter, sort, query }`。
 * @returns 可直接渲染的团队数组。
 */
export function overviewTeams(teams, { filter = 'all', sort = 'active', query = '' } = {}) {
  return sortTeams(filterTeams(teams, filter, query), sort)
}

/** 任务计数求和（与列表项 `taskCounts` 对齐的便捷导出）。 */
export { taskTotal }
