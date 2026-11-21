/**
 * src/session-changes/index.js 纯账本单测：路径去重、agent/轮次累计、删除标记、
 * 排序与空账本。不启动 DSH，也不依赖 fs / React。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { createLedger, summarizeLedger } from '../src/session-changes/index.js'
import { apply as applySessionChanges } from '../src/session-changes/index.js'

test('同一路径去重，累计 agent、轮次与编辑次数', () => {
  const ledger = createLedger()
  ledger.record('s1', '/w', { path: '/w/a.js', agent: 'lead', turn: 1 })
  ledger.record('s1', '/w', { path: '/w/a.js', agent: 'bob', turn: 2 })
  ledger.record('s1', '/w', { path: '/w/a.js', agent: 'bob', turn: 2 })

  const summary = ledger.summary('s1')
  assert.equal(summary.total, 1)
  assert.equal(summary.edits, 3)
  assert.equal(summary.files.length, 1)
  assert.deepEqual(summary.files[0].agents, ['bob', 'lead'])
  assert.deepEqual(summary.files[0].turns, [1, 2])
  assert.equal(summary.files[0].deleted, false)
})

test('不同会话分开记账，缺失会话返回 null', () => {
  const ledger = createLedger()
  ledger.record('s1', '/w', { path: '/w/a.js', agent: 'lead', turn: 1 })
  ledger.record('s2', '/w', { path: '/w/b.js', agent: 'lead', turn: 1 })

  assert.equal(ledger.summary('s1').total, 1)
  assert.equal(ledger.summary('s2').total, 1)
  assert.equal(ledger.summary('missing'), null)
})

test('按最后修改轮次倒序、同轮次按路径升序', () => {
  const ledger = createLedger()
  ledger.record('s1', '/w', { path: '/w/old.js', agent: 'lead', turn: 1 })
  ledger.record('s1', '/w', { path: '/w/b.js', agent: 'lead', turn: 2 })
  ledger.record('s1', '/w', { path: '/w/a.js', agent: 'lead', turn: 2 })

  const files = ledger.summary('s1').files
  assert.deepEqual(files.map(file => file.path), ['/w/a.js', '/w/b.js', '/w/old.js'])
})

test('最新轮次只升不降，空账本 latestTurn 为 0', () => {
  const ledger = createLedger()
  ledger.touchTurn('s1', 5)
  ledger.touchTurn('s1', 3)
  ledger.record('s1', '/w', { path: '/w/a.js', agent: 'lead', turn: 2 })
  assert.equal(ledger.summary('s1').latestTurn, 5)

  const empty = summarizeLedger({ sessionId: 's0', cwd: '/w', updatedAt: 0, files: new Map() })
  assert.equal(empty.latestTurn, 0)
})

test('删除标记一旦出现就保留；空账本摘要稳定', () => {
  const ledger = createLedger()
  ledger.record('s1', '/w', { path: '/w/gone.js', agent: 'bob', turn: 3, deleted: true })
  ledger.record('s1', '/w', { path: '/w/gone.js', agent: 'bob', turn: 4 })

  const summary = ledger.summary('s1')
  assert.equal(summary.files[0].deleted, true)

  const empty = summarizeLedger({ sessionId: 's0', cwd: '/w', updatedAt: 0, files: new Map() })
  assert.equal(empty.total, 0)
  assert.equal(empty.edits, 0)
  assert.deepEqual(empty.files, [])
  assert.equal(empty.sessionId, 's0')
})

/**
 * 构造可驱动 fs intent 与 summary 路由的假宿主。
 * @returns {object} fake ctx、监听器、路由与 agent fixtures。
 */
function fakeHost() {
  const listeners = new Map()
  const routes = []
  const lead = { id: 'agent-lead', name: 'lead', session: { id: 's1', header: { cwd: '/w' } } }
  lead.root = lead
  const worker = { id: 'agent-worker', name: 'bob', session: { id: 's2', header: { cwd: '/w2' } }, root: lead }
  const connection = {
    fetch: {
      register(options) {
        routes.push(options)
        return () => {}
      },
    },
  }
  const ctx = {
    get(service) {
      if (service === 'subagents') return { rootOf: agent => agent?.root ?? agent }
      if (service === 'fs') return { processPath: target => target?.path }
      if (service === 'connection') return connection
      return undefined
    },
    on(event, listener) {
      listeners.set(event, listener)
      return () => {}
    },
    inject(_services, callback) {
      callback({
        get(service) {
          return service === 'connection' ? connection : undefined
        },
        effect() {
          // 路由清理在真实宿主里由 connection 作用域负责；测试不驱动卸载。
        },
      })
      return () => {}
    },
    effect(callback) {
      return () => {
        callback()()
      }
    },
  }
  return { ctx, listeners, routes, lead, worker }
}

test('apply 记录顶层与子代理编辑，并通过只读路由返回会话摘要', async () => {
  const host = fakeHost()
  applySessionChanges(host.ctx, {})
  host.listeners.get('session/event')({ id: 's1' }, { type: 'turn/start', data: { turn: 1 } })
  host.listeners.get('session/event')({ id: 's2' }, { type: 'turn/start', data: { turn: 2 } })
  await host.listeners.get('fs/write-intent')({ path: '/w/a.js' }, host.lead, async () => ({ kind: 'allow' }))
  await host.listeners.get('fs/edit-intent')({ path: 'b.js' }, { agent: host.worker }, async () => ({ kind: 'allow' }))
  await host.listeners.get('fs/write-intent')({ path: '/w/denied.js' }, host.lead, async () => ({ kind: 'deny' }))
  await host.listeners.get('fs/write-intent')({ path: '/w/ghost.js' }, { id: 'exec-without-agent' }, async () => ({ kind: 'allow' }))

  const route = host.routes.find(candidate => candidate.path === '/api/dsh-session-changes/summary')
  assert.ok(route, 'summary 路由必须注册')
  const response = await route.fetch(new Request('http://localhost/api/dsh-session-changes/summary?sessionId=s1'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.plugin, 'dsh-session-changes')
  assert.equal(payload.latestTurn, 1)
  assert.equal(payload.total, 2)
  assert.equal(payload.edits, 2)
  assert.deepEqual(payload.files.map(file => file.path).sort(), ['/w/a.js', '/w2/b.js'])
  assert.ok(payload.files.every(file => file.path !== '/w/denied.js'), '被拒绝的写入不能入账')
  assert.ok(payload.files.every(file => file.path !== '/w/ghost.js'), '没有 agent/session 的 exec 不能入账')
  const edited = payload.files.find(file => file.path === '/w/a.js')
  assert.deepEqual(edited.agents, ['lead'])
  assert.deepEqual(edited.turns, [1])
  const fromWorker = payload.files.find(file => file.path === '/w2/b.js')
  assert.deepEqual(fromWorker.agents, ['bob'], '子代理的 exec.agent 必须被解包')
  assert.deepEqual(fromWorker.turns, [2])
})

test('summary 路由拒绝非法 sessionId，未知会话返回空摘要', async () => {
  const host = fakeHost()
  applySessionChanges(host.ctx, {})
  const route = host.routes.find(candidate => candidate.path === '/api/dsh-session-changes/summary')
  assert.ok(route)

  const bad = await route.fetch(new Request('http://localhost/api/dsh-session-changes/summary?sessionId=../x'))
  assert.equal(bad.status, 400)

  const empty = await route.fetch(new Request('http://localhost/api/dsh-session-changes/summary?sessionId=s9'))
  assert.equal(empty.status, 200)
  const emptyPayload = await empty.json()
  assert.deepEqual(emptyPayload.files, [])
  assert.equal(emptyPayload.latestTurn, 0)
})

test('Lead 的 name 是 session id 时，展示名回退为 Lead 而不是抄 id', async () => {
  const host = fakeHost()
  host.lead.name = 'session-78fb3d29-bab2-4e57-a4f7-196acf3ca1d8'
  applySessionChanges(host.ctx, {})
  await host.listeners.get('fs/write-intent')({ path: '/w/a.js' }, host.lead, async () => ({ kind: 'allow' }))
  const route = host.routes.find(candidate => candidate.path === '/api/dsh-session-changes/summary')
  const payload = await (await route.fetch(new Request('http://localhost/api/dsh-session-changes/summary?sessionId=s1'))).json()
  assert.deepEqual(payload.files[0].agents, ['Lead'])
})
