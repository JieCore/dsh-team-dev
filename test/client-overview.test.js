/**
 * 「全部团队」总览的纯函数单测（node --test）。
 *
 * 覆盖：任务计数归一化、完成度、状态判定、统计汇总、展示名、成员缩写、
 * 状态/搜索筛选、三种排序的确定性与 tie-breaker、筛选+排序管线。
 * 不依赖 React / 浏览器环境。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OVERVIEW_FILTERS,
  OVERVIEW_SORTS,
  filterTeams,
  memberInitial,
  overviewSummary,
  overviewTeams,
  sortTeams,
  teamCounts,
  teamDisplayName,
  teamProgress,
  teamState,
} from '../src/client/overview.js'

/** 构造测试用团队列表项。 */
function team(teamId, leadName, counts, members = []) {
  return { teamId, leadName, members, taskCounts: counts }
}

const TEAMS = [
  team('team-alpha-0001', 'lead', { pending: 3, in_progress: 1, completed: 4 }, [{ id: 'a1', name: 'architect', role: 'teammate' }]),
  team('team-bravo-0002', 'lead', { pending: 0, in_progress: 3, completed: 5 }, [{ id: 'b1', name: 'reviewer', role: 'teammate' }]),
  team('team-charlie-0003', 'lead', { pending: 0, in_progress: 0, completed: 6 }, []),
]

test('teamCounts 归一化缺失/异常 taskCounts', () => {
  assert.deepEqual(teamCounts({ taskCounts: { pending: 2, in_progress: 1, completed: 3 } }), { pending: 2, in_progress: 1, completed: 3, total: 6 })
  assert.deepEqual(teamCounts({}), { pending: 0, in_progress: 0, completed: 0, total: 0 })
  assert.deepEqual(teamCounts(null), { pending: 0, in_progress: 0, completed: 0, total: 0 })
  assert.deepEqual(teamCounts({ taskCounts: { pending: '2', in_progress: null, completed: undefined } }), { pending: 2, in_progress: 0, completed: 0, total: 2 })
})

test('teamProgress 计算完成度并四舍五入', () => {
  assert.deepEqual(teamProgress(team('t1', 'lead', { pending: 3, in_progress: 1, completed: 4 })), { completed: 4, total: 8, percent: 50 })
  assert.deepEqual(teamProgress(team('t2', 'lead', { pending: 1, in_progress: 0, completed: 2 })), { completed: 1 + 1, total: 3, percent: 67 })
  assert.deepEqual(teamProgress(team('t3', 'lead', { pending: 0, in_progress: 0, completed: 0 })), { completed: 0, total: 0, percent: 0 })
})

test('teamState 判定 active / pending / done', () => {
  assert.equal(teamState(team('t1', 'lead', { pending: 3, in_progress: 1, completed: 4 })), 'active')
  assert.equal(teamState(team('t2', 'lead', { pending: 2, in_progress: 0, completed: 4 })), 'pending')
  assert.equal(teamState(team('t3', 'lead', { pending: 0, in_progress: 0, completed: 6 })), 'done')
  assert.equal(teamState(team('t4', 'lead', { pending: 0, in_progress: 0, completed: 0 })), 'done')
})

test('overviewSummary 汇总在线团队、任务、进行中与已完成', () => {
  assert.deepEqual(overviewSummary(TEAMS), { teams: 3, tasks: 22, inProgress: 4, completed: 15 })
  assert.deepEqual(overviewSummary([]), { teams: 0, tasks: 0, inProgress: 0, completed: 0 })
  assert.deepEqual(overviewSummary(null), { teams: 0, tasks: 0, inProgress: 0, completed: 0 })
})

test('teamDisplayName 使用 Lead 名 + 短 teamId，不虚构标题', () => {
  assert.equal(teamDisplayName(TEAMS[0]), 'lead · team-alp')
  assert.equal(teamDisplayName({ teamId: 'short', leadName: '' }), 'lead · short')
})

test('memberInitial 处理英文、中文与空名', () => {
  assert.equal(memberInitial({ name: 'architect' }), 'A')
  assert.equal(memberInitial({ name: '张三' }), '张')
  assert.equal(memberInitial({ name: '  ' }), '?')
  assert.equal(memberInitial(null), '?')
})

test('filterTeams 按状态与搜索词过滤（大小写不敏感、不修改入参）', () => {
  assert.equal(filterTeams(TEAMS, 'all', '').length, 3)
  assert.deepEqual(filterTeams(TEAMS, 'active', '').map(t => t.teamId), ['team-alpha-0001', 'team-bravo-0002'])
  assert.deepEqual(filterTeams(TEAMS, 'done', '').map(t => t.teamId), ['team-charlie-0003'])
  assert.deepEqual(filterTeams(TEAMS, 'all', 'BRAVO').map(t => t.teamId), ['team-bravo-0002'])
  assert.deepEqual(filterTeams(TEAMS, 'all', '  alpha ').map(t => t.teamId), ['team-alpha-0001'])
  assert.deepEqual(filterTeams(TEAMS, 'active', 'charlie').map(t => t.teamId), [])
  const before = TEAMS.map(t => t.teamId)
  filterTeams(TEAMS, 'all', '')
  assert.deepEqual(TEAMS.map(t => t.teamId), before)
})

test('sortTeams 默认按进行中降序，tie-breaker 为 teamId 升序', () => {
  const sorted = sortTeams(TEAMS, 'active')
  assert.deepEqual(sorted.map(t => t.teamId), ['team-bravo-0002', 'team-alpha-0001', 'team-charlie-0003'])
  // 相同进行中数量时按 teamId 升序（确定性，不依赖输入顺序）。
  const tied = [
    team('team-z', 'lead', { pending: 0, in_progress: 1, completed: 0 }),
    team('team-a', 'lead', { pending: 0, in_progress: 1, completed: 0 }),
  ]
  assert.deepEqual(sortTeams(tied, 'active').map(t => t.teamId), ['team-a', 'team-z'])
  assert.deepEqual(tied.map(t => t.teamId), ['team-z', 'team-a'], '不修改入参')
})

test('sortTeams 支持按任务总数与按名称', () => {
  // alpha 与 bravo 任务总数同为 8，tie-breaker 为 teamId 升序 → alpha 在前。
  assert.deepEqual(sortTeams(TEAMS, 'total').map(t => t.teamId), ['team-alpha-0001', 'team-bravo-0002', 'team-charlie-0003'])
  assert.deepEqual(sortTeams(TEAMS, 'name').map(t => t.teamId), ['team-alpha-0001', 'team-bravo-0002', 'team-charlie-0003'])
})

test('overviewTeams 管线：先筛选再排序', () => {
  // 筛选 active 后按任务总数排序：两者同为 8，tie-breaker teamId 升序。
  assert.deepEqual(overviewTeams(TEAMS, { filter: 'active', sort: 'total', query: '' }).map(t => t.teamId), ['team-alpha-0001', 'team-bravo-0002'])
  assert.deepEqual(overviewTeams(TEAMS, { filter: 'all', sort: 'active', query: 'charlie' }).map(t => t.teamId), ['team-charlie-0003'])
  assert.deepEqual(overviewTeams([], { filter: 'all', sort: 'name', query: '' }), [])
})

test('常量与 UI 视图选项保持对齐', () => {
  assert.deepEqual(OVERVIEW_FILTERS, ['all', 'active', 'pending', 'done'])
  assert.deepEqual(OVERVIEW_SORTS, ['active', 'total', 'name'])
})
