/**
 * src/client/api.js 单元测试：纯逻辑（三列分组、默认团队选择）与 fetch 封装
 * （同源只读 GET、显式 teamId、404 兜底查询、错误归一化、Abort 透传）。
 * 不依赖 React / DOM。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ApiError,
  BACKOFF_MS,
  POLL_INTERVAL_MS,
  TASK_STATUSES,
  fetchTeam,
  fetchTeams,
  groupTasks,
  pickTeamId,
  shortTeamId,
  taskTotal,
  teamMatchesSession,
} from '../src/client/api.js'

const PREFIX = '/api/dsh-team-dev'

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function installFetch(t, handler) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return await handler(String(url), init)
  }
  t.after(() => { globalThis.fetch = original })
  return calls
}

test('常量：轮询间隔、退避梯度、三列状态与 design 一致', () => {
  assert.equal(POLL_INTERVAL_MS, 5000)
  assert.deepEqual(BACKOFF_MS, [5000, 15000, 30000])
  assert.deepEqual(TASK_STATUSES, ['pending', 'in_progress', 'completed'])
})

test('groupTasks：按三状态分组并过滤 deleted/未知状态', () => {
  const tasks = [
    { id: '1', status: 'pending' },
    { id: '2', status: 'in_progress' },
    { id: '3', status: 'completed' },
    { id: '4', status: 'deleted' },
    { id: '5', status: 'archived' },
    null,
  ]
  const groups = groupTasks(tasks)
  assert.deepEqual(groups.pending.map(task => task.id), ['1'])
  assert.deepEqual(groups.in_progress.map(task => task.id), ['2'])
  assert.deepEqual(groups.completed.map(task => task.id), ['3'])
  assert.deepEqual(groupTasks(undefined), { pending: [], in_progress: [], completed: [] })
})

test('taskTotal / shortTeamId：计数求和与短 id', () => {
  assert.equal(taskTotal({ pending: 2, in_progress: 1, completed: 5 }), 8)
  assert.equal(taskTotal(null), 0)
  assert.equal(taskTotal({ pending: '2', completed: 1 }), 3)
  assert.equal(shortTeamId('0123456789abcdef'), '01234567')
  assert.equal(shortTeamId('short'), 'short')
  assert.equal(shortTeamId(undefined), '')
})

test('teamMatchesSession：teamId / leadSessionId / members[].id 三种命中', () => {
  const team = { teamId: 'team-1', leadSessionId: 'sess-lead', members: [{ id: 'sess-worker' }] }
  assert.equal(teamMatchesSession(team, 'team-1'), true)
  assert.equal(teamMatchesSession(team, 'sess-lead'), true)
  assert.equal(teamMatchesSession(team, 'sess-worker'), true)
  assert.equal(teamMatchesSession(team, 'sess-other'), false)
  assert.equal(teamMatchesSession(team, null), false)
  assert.equal(teamMatchesSession(null, 'team-1'), false)
})

test('pickTeamId：当前会话优先 → 上次选择 → 第一个 → 手动选择保留', () => {
  const teams = [
    { teamId: 'team-a', leadSessionId: 'sess-a', members: [{ id: 'sess-a' }] },
    { teamId: 'team-b', leadSessionId: 'sess-b', members: [{ id: 'sess-c' }] },
  ]
  // 空列表清空选择。
  assert.equal(pickTeamId([], 'sess-a', 'team-a'), null)
  // 当前会话命中团队优先于上次选择。
  assert.equal(pickTeamId(teams, 'sess-c', 'team-a'), 'team-b')
  // 当前会话不在任何团队时保留上次选择。
  assert.equal(pickTeamId(teams, 'sess-other', 'team-b'), 'team-b')
  // 上次选择已消失时回退第一个。
  assert.equal(pickTeamId(teams, 'sess-other', 'team-gone'), 'team-a')
  // 用户手动选择：不被默认算法覆盖。
  assert.equal(pickTeamId(teams, 'sess-a', 'team-b', true), 'team-b')
  // 手动选择仍存在但 sessionId 为空时保持。
  assert.equal(pickTeamId(teams, null, 'team-b', true), 'team-b')
})

test('fetchTeams：同源只读 GET /teams，no-store，返回 JSON', async t => {
  const calls = installFetch(t, () => jsonResponse({ plugin: 'dsh-team-dev', degraded: false, teams: [] }))
  const payload = await fetchTeams()
  assert.equal(payload.degraded, false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `${PREFIX}/teams`)
  assert.equal(calls[0].init.cache, 'no-store')
  assert.equal(calls[0].init.credentials, 'same-origin')
})

test('fetchTeam：精确路径成功时只发一次请求，teamId 正确编码', async t => {
  const calls = installFetch(t, () => jsonResponse({ plugin: 'dsh-team-dev', degraded: false, team: { teamId: 'team-a/b' } }))
  const payload = await fetchTeam('team-a/b')
  assert.equal(payload.team.teamId, 'team-a/b')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `${PREFIX}/teams/team-a%2Fb`)
})

test('fetchTeam：精确路径 404 时回退 ?teamId= 查询', async t => {
  const calls = installFetch(t, url => {
    if (url.endsWith('?teamId=team-1')) return jsonResponse({ plugin: 'dsh-team-dev', team: { teamId: 'team-1' } })
    return jsonResponse({ error: 'team-not-found' }, 404)
  })
  const payload = await fetchTeam('team-1')
  assert.equal(payload.team.teamId, 'team-1')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, `${PREFIX}/teams/team-1`)
  assert.equal(calls[1].url, `${PREFIX}/teams?teamId=team-1`)
})

test('fetchTeam：两次都失败时抛第一次的 404 语义', async t => {
  installFetch(t, url => {
    if (url.endsWith('?teamId=team-1')) throw new Error('network down')
    return jsonResponse({ error: 'team-not-found' }, 404)
  })
  await assert.rejects(
    () => fetchTeam('team-1'),
    error => error instanceof ApiError && error.status === 404 && error.message === 'team-not-found',
  )
})

test('fetchTeam：AbortError 直接透传，不触发兜底请求', async t => {
  const calls = installFetch(t, () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }) })
  await assert.rejects(
    () => fetchTeam('team-1'),
    error => error.name === 'AbortError',
  )
  assert.equal(calls.length, 1)
})

test('错误归一化：网络失败 → ApiError(0)，非 JSON 错误响应 → HTTP 状态', async t => {
  installFetch(t, () => { throw new Error('offline') })
  await assert.rejects(
    () => fetchTeams(),
    error => error instanceof ApiError && error.status === 0,
  )
  installFetch(t, () => new Response('bad gateway', { status: 502 }))
  await assert.rejects(
    () => fetchTeams(),
    error => error instanceof ApiError && error.status === 502 && /HTTP 502/.test(error.message),
  )
})
