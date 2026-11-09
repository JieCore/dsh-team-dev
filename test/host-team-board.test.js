/**
 * src/host/team-board.js 单元测试（不启动 DSH）。
 * 覆盖 design §2.2–§2.6：数据映射、团队枚举、降级分支、只读路由契约与卸载清理。
 * agentTeams / agents / connection 全部使用 fake 对象。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTeamDetail,
  buildTeamsSnapshot,
  registerRoutes,
  teamBoardApply,
} from '../src/host/team-board.js'

const PREFIX = '/api/dsh-team-dev'
const LIST_PATH = `${PREFIX}/teams`

// ---------- fixtures ----------
const leadA = { id: 'sess-a', name: 'alice' }
const workerA = { id: 'sess-b', name: 'bob' }
const leadB = { id: 'sess-c', name: 'carol' }
const workerB = { id: 'sess-d', name: 'dave' }

const membersA = [
  { id: 'sess-a', name: 'alice', role: 'lead', status: 'running', model: 'm1', diagnostics: [] },
  { id: 'sess-b', name: 'bob', role: 'teammate', status: 'inactive', model: 'm2' },
]
const tasksA = [
  { id: 't1', subject: '待处理', status: 'pending', ownerName: 'bob', revision: 1, blockedBy: [], writeScopes: [] },
  { id: 't2', subject: '进行中', status: 'in_progress', ownerName: 'bob', revision: 2, blockedBy: ['t1'], writeScopes: ['src/a'] },
  { id: 't3', subject: '已完成', status: 'completed', ownerName: 'alice', revision: 3 },
  { id: 't4', subject: '已删除', status: 'deleted' },
  { id: 't5', subject: '未知状态', status: 'archived' },
]
const membersB = [{ id: 'sess-c', name: 'carol', role: 'lead', status: 'running' }]
const tasksB = [{ id: 'u1', subject: 'B 待处理', status: 'pending', ownerName: 'dave' }]
const agentsAll = [leadA, workerA, leadB, workerB]

function membershipOf(agent) {
  if (agent === leadA || agent === workerA) {
    return { id: 'team-1', root: leadA, role: agent === leadA ? 'lead' : 'teammate', name: 'alice' }
  }
  if (agent === leadB || agent === workerB) {
    return { id: 'team-2', root: leadB, role: agent === leadB ? 'lead' : 'teammate', name: 'carol' }
  }
  return undefined
}

function makeService(overrides = {}) {
  const calls = { membership: [], members: [], tasks: [] }
  return {
    calls,
    tryMembership(agent) {
      calls.membership.push(agent)
      if (overrides.tryMembership) return overrides.tryMembership(agent, calls)
      return membershipOf(agent)
    },
    listMembers(root) {
      calls.members.push(root)
      if (overrides.listMembers) return overrides.listMembers(root, calls)
      return root === leadA || root === workerA ? membersA : membersB
    },
    listTasks(root) {
      calls.tasks.push(root)
      if (overrides.listTasks) return overrides.listTasks(root, calls)
      return root === leadA || root === workerA ? tasksA : tasksB
    },
  }
}

function makeConnection() {
  const routes = new Map()
  const attempts = []
  return {
    routes,
    attempts,
    fetch: {
      register(definition) {
        attempts.push(definition.path)
        routes.set(definition.path, definition)
        return () => { routes.delete(definition.path) }
      },
    },
  }
}

function makeContext({ connection, agentTeams, agents, getThrows = false } = {}) {
  const services = { connection, agentTeams, agents }
  const ctx = {
    injected: [],
    effectCallbacks: [],
    get(name) {
      if (getThrows) throw new Error('service unavailable')
      return services[name]
    },
    inject(deps, callback) {
      ctx.injected.push(deps)
      callback(ctx)
      return () => {}
    },
    effect(callback) {
      ctx.effectCallbacks.push(callback)
      return () => {}
    },
  }
  return ctx
}

async function requestRoute(route, path) {
  return await route.fetch(new Request(`http://localhost${path}`))
}

// ---------- 纯函数：正常路径 ----------
test('buildTeamsSnapshot：多团队映射、三状态计数、deleted 过滤、成员精简、稳定排序', () => {
  const service = makeService()
  const snapshot = buildTeamsSnapshot(service, [...agentsAll].reverse())

  assert.equal(snapshot.length, 2)
  assert.deepEqual(snapshot.map(team => team.teamId), ['team-1', 'team-2'])

  const team1 = snapshot[0]
  assert.equal(team1.leadName, 'alice')
  assert.equal(team1.leadSessionId, 'sess-a')
  assert.equal(team1.memberCount, 2)
  assert.deepEqual(team1.taskCounts, { pending: 1, in_progress: 1, completed: 1 })
  assert.deepEqual(team1.members, [
    { id: 'sess-a', name: 'alice', role: 'lead', status: 'running' },
    { id: 'sess-b', name: 'bob', role: 'teammate', status: 'inactive' },
  ])
  // 列表接口的参数必须是 Agent（不是 sessionId）。
  assert.ok(service.calls.members.includes(leadA))
  assert.ok(service.calls.tasks.includes(leadA))

  assert.equal(snapshot[1].teamId, 'team-2')
  assert.equal(snapshot[1].leadName, 'carol')
  assert.deepEqual(snapshot[1].taskCounts, { pending: 1, in_progress: 0, completed: 0 })

  // 输入顺序变化不改变输出顺序（团队按 teamId 稳定排序）。
  const again = buildTeamsSnapshot(makeService(), agentsAll)
  assert.deepEqual(again, snapshot)
})

test('buildTeamsSnapshot：agents 接受 AgentRegistry（list()）', () => {
  const snapshot = buildTeamsSnapshot(makeService(), { list: () => agentsAll })
  assert.deepEqual(snapshot.map(team => team.teamId), ['team-1', 'team-2'])
})

test('buildTeamDetail：全量透传、deleted 过滤、数组字段脱离服务实例', () => {
  const service = makeService()
  const detail = buildTeamDetail(service, agentsAll, 'team-1')

  assert.equal(detail.teamId, 'team-1')
  assert.equal(detail.leadName, 'alice')
  assert.deepEqual(detail.members.map(member => member.id), ['sess-a', 'sess-b'])
  // pending/in_progress/completed/archived 透传，deleted 过滤。
  assert.equal(detail.tasks.length, 4)
  assert.ok(detail.tasks.every(task => task.status !== 'deleted'))
  assert.deepEqual(detail.taskCounts, { pending: 1, in_progress: 1, completed: 1 })

  const inProgress = detail.tasks.find(task => task.id === 't2')
  assert.equal(inProgress.revision, 2)
  assert.deepEqual(inProgress.blockedBy, ['t1'])
  assert.deepEqual(inProgress.writeScopes, ['src/a'])
  assert.deepEqual(inProgress.writeScopeWarnings, [])

  const leadMember = detail.members.find(member => member.id === 'sess-a')
  assert.equal(leadMember.model, 'm1')
  leadMember.diagnostics.push('changed')
  assert.deepEqual(membersA[0].diagnostics, [], 'diagnostics 必须是副本，不能污染服务数据')
})

// ---------- 纯函数：边界 ----------
test('边界：空团队 / 空 roster / 空任务 / 未知 teamId', () => {
  assert.deepEqual(buildTeamsSnapshot(null, agentsAll), [])
  assert.deepEqual(buildTeamsSnapshot(undefined, undefined), [])
  assert.deepEqual(buildTeamsSnapshot({}, agentsAll), [])
  assert.deepEqual(buildTeamsSnapshot(makeService(), []), [])
  assert.deepEqual(buildTeamsSnapshot(makeService({ tryMembership: () => undefined }), agentsAll), [])
  assert.deepEqual(buildTeamsSnapshot(makeService({ tryMembership: () => null }), agentsAll), [])
  assert.equal(buildTeamDetail(makeService(), agentsAll, 'team-404'), null)
  assert.equal(buildTeamDetail(makeService(), agentsAll, undefined), null)

  const emptyRoster = makeService({ listMembers: () => [], listTasks: () => [] })
  const snapshot = buildTeamsSnapshot(emptyRoster, [leadA])
  assert.equal(snapshot.length, 1)
  assert.deepEqual(snapshot[0].members, [])
  assert.equal(snapshot[0].memberCount, 1, 'roster 为空时退化为探测到的 Agent 数')
  assert.equal(snapshot[0].leadName, 'alice', 'roster 为空时回退 membership.name')
  assert.deepEqual(snapshot[0].taskCounts, { pending: 0, in_progress: 0, completed: 0 })

  const detail = buildTeamDetail(emptyRoster, [leadA], 'team-1')
  assert.deepEqual(detail.members, [])
  assert.deepEqual(detail.tasks, [])
})

// ---------- 纯函数：失败路径 ----------
test('失败路径：单个 Agent tryMembership 抛错被跳过，其余团队照常', () => {
  const service = makeService({
    tryMembership(agent) {
      if (agent === workerA) throw new Error('stale identity')
      return membershipOf(agent)
    },
  })
  const snapshot = buildTeamsSnapshot(service, agentsAll)
  assert.deepEqual(snapshot.map(team => team.teamId), ['team-1', 'team-2'])
  assert.equal(snapshot[0].memberCount, 2)
})

test('失败路径：listMembers / listTasks 抛错时团队仍可见、看板降级为空板', () => {
  const service = makeService({
    listMembers: () => { throw new Error('roster boom') },
    listTasks: () => { throw new Error('tasks boom') },
  })
  const snapshot = buildTeamsSnapshot(service, [leadA])
  assert.equal(snapshot.length, 1)
  assert.deepEqual(snapshot[0].members, [])
  assert.equal(snapshot[0].memberCount, 1)
  assert.deepEqual(snapshot[0].taskCounts, { pending: 0, in_progress: 0, completed: 0 })

  const detail = buildTeamDetail(service, [leadA], 'team-1')
  assert.notEqual(detail, null)
  assert.deepEqual(detail.tasks, [])
})

// ---------- 路由：正常路径 ----------
test('路由：teamBoardApply 注册 GET /teams，200 + no-store + 正常快照', async () => {
  const connection = makeConnection()
  const ctx = makeContext({ connection, agentTeams: makeService(), agents: { list: () => agentsAll } })
  teamBoardApply(ctx)

  assert.deepEqual(ctx.injected, [['connection']])
  assert.ok(connection.routes.has(LIST_PATH))
  const route = connection.routes.get(LIST_PATH)
  assert.deepEqual(route.methods, ['GET'])

  const response = await requestRoute(route, LIST_PATH)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.plugin, 'dsh-team-dev')
  assert.equal(payload.degraded, false)
  assert.equal(payload.reason, null)
  assert.equal(payload.teams.length, 2)
})

test('路由：首次 /teams 后按真实 teamId 惰性注册精确详情路由', async () => {
  const connection = makeConnection()
  const ctx = makeContext({ connection, agentTeams: makeService(), agents: agentsAll })
  teamBoardApply(ctx)
  const listRoute = connection.routes.get(LIST_PATH)

  assert.equal(connection.routes.has(`${LIST_PATH}/team-1`), false)
  await requestRoute(listRoute, LIST_PATH)
  assert.ok(connection.routes.has(`${LIST_PATH}/team-1`), '列表请求后应惰性注册详情路由')
  assert.ok(connection.routes.has(`${LIST_PATH}/team-2`))

  const detailRoute = connection.routes.get(`${LIST_PATH}/team-1`)
  assert.deepEqual(detailRoute.methods, ['GET'])
  const response = await requestRoute(detailRoute, `${LIST_PATH}/team-1`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.degraded, false)
  assert.equal(payload.team.teamId, 'team-1')
  assert.equal(payload.team.tasks.length, 4)
})

test('路由：?teamId= 兜底详情、未知 404、非法 400（均 no-store）', async () => {
  const connection = makeConnection()
  const ctx = makeContext({ connection, agentTeams: makeService(), agents: agentsAll })
  teamBoardApply(ctx)
  const listRoute = connection.routes.get(LIST_PATH)

  const ok = await requestRoute(listRoute, `${LIST_PATH}?teamId=team-2`)
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('cache-control'), 'no-store')
  const okPayload = await ok.json()
  assert.equal(okPayload.team.teamId, 'team-2')

  const missing = await requestRoute(listRoute, `${LIST_PATH}?teamId=team-404`)
  assert.equal(missing.status, 404)
  assert.equal(missing.headers.get('cache-control'), 'no-store')
  assert.equal((await missing.json()).error, 'team-not-found')

  const invalid = await requestRoute(listRoute, `${LIST_PATH}?teamId=${encodeURIComponent('../etc/passwd')}`)
  assert.equal(invalid.status, 400)
  assert.equal(invalid.headers.get('cache-control'), 'no-store')
  assert.equal((await invalid.json()).error, 'invalid-team-id')
  assert.ok(![...connection.routes.keys()].some(path => path.includes('passwd')))
})

// ---------- 路由：降级与失败路径 ----------
test('降级：agentTeams 缺失/形状不符 → 200 degraded:true，详情同样降级', async () => {
  for (const agentTeams of [undefined, {}, { tryMembership: null }]) {
    const connection = makeConnection()
    const ctx = makeContext({ connection, agentTeams, agents: agentsAll })
    teamBoardApply(ctx)
    const listRoute = connection.routes.get(LIST_PATH)

    const response = await requestRoute(listRoute, LIST_PATH)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const payload = await response.json()
    assert.equal(payload.degraded, true)
    assert.equal(payload.reason, 'agent-teams-unavailable')
    assert.deepEqual(payload.teams, [])

    const detail = await requestRoute(listRoute, `${LIST_PATH}?teamId=team-1`)
    assert.equal(detail.status, 200)
    const detailPayload = await detail.json()
    assert.equal(detailPayload.degraded, true)
    assert.equal(detailPayload.team, null)
    // 非法 teamId 优先于降级返回 400。
    assert.equal((await requestRoute(listRoute, `${LIST_PATH}?teamId=${encodeURIComponent('bad id!')}`)).status, 400)
  }
})

test('降级：探测服务读属性抛错 → reason=probe-failed', async () => {
  const brokenService = {}
  Object.defineProperty(brokenService, 'tryMembership', {
    get() { throw new Error('probe boom') },
  })
  const connection = makeConnection()
  const ctx = makeContext({ connection, agentTeams: brokenService, agents: agentsAll })
  teamBoardApply(ctx)
  const listRoute = connection.routes.get(LIST_PATH)

  const response = await requestRoute(listRoute, LIST_PATH)
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.degraded, true)
  assert.equal(payload.reason, 'probe-failed')
  assert.deepEqual(payload.teams, [])
})

test('降级：connection 缺失 / register 不可用 / register 抛错都不影响插件加载', async () => {
  assert.doesNotThrow(() => teamBoardApply(null))
  assert.doesNotThrow(() => teamBoardApply('not-an-object'))
  assert.doesNotThrow(() => teamBoardApply({}))
  assert.doesNotThrow(() => registerRoutes({ get: () => undefined }))
  assert.doesNotThrow(() => registerRoutes({ get: () => ({ fetch: {} }) }))
  assert.doesNotThrow(() => registerRoutes({ get: () => ({ fetch: { register() { throw new Error('path taken') } } }) }))

  // 无 inject 的旧宿主/测试桩：同步探测 connection 后注册路由。
  const connection = makeConnection()
  const ctx = { get: name => (name === 'connection' ? connection : undefined) }
  teamBoardApply(ctx)
  assert.ok(connection.routes.has(LIST_PATH))
})

test('路由：单团队精确路由注册失败时列表仍可用，兜底查询可用且不重复重试', async () => {
  const connection = makeConnection()
  const originalRegister = connection.fetch.register
  connection.fetch.register = definition => {
    connection.attempts.push(definition.path)
    if (definition.path.endsWith('/team-2')) throw new Error('route conflict')
    return originalRegister(definition)
  }
  const ctx = makeContext({ connection, agentTeams: makeService(), agents: agentsAll })
  teamBoardApply(ctx)
  const listRoute = connection.routes.get(LIST_PATH)

  const response = await requestRoute(listRoute, LIST_PATH)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).teams.length, 2)
  assert.equal(connection.routes.has(`${LIST_PATH}/team-1`), true)
  assert.equal(connection.routes.has(`${LIST_PATH}/team-2`), false)

  // 第二次列表请求不应重复尝试注册失败的路径。
  await requestRoute(listRoute, LIST_PATH)
  assert.equal(connection.attempts.filter(path => path.endsWith('/team-2')).length, 1)

  const fallback = await requestRoute(listRoute, `${LIST_PATH}?teamId=team-2`)
  assert.equal(fallback.status, 200)
  assert.equal((await fallback.json()).team.teamId, 'team-2')
})

test('卸载：effect 清理函数注销列表与惰性详情路由', async () => {
  const connection = makeConnection()
  const ctx = makeContext({ connection, agentTeams: makeService(), agents: agentsAll })
  teamBoardApply(ctx)
  const listRoute = connection.routes.get(LIST_PATH)
  await requestRoute(listRoute, LIST_PATH)
  assert.ok(connection.routes.has(`${LIST_PATH}/team-1`))
  assert.equal(ctx.effectCallbacks.length, 1, '应注册一个卸载清理 effect')

  const cleanup = ctx.effectCallbacks[0]()
  assert.equal(typeof cleanup, 'function')
  cleanup()
  assert.deepEqual([...connection.routes.keys()], [])
})
