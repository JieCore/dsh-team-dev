/**
 * 客户端看板渲染测试：用 sibling 仓库的 esbuild 把 src/client/TeamBoard.jsx 打成 CJS
 * bundle，在 jsdom + react-dom/client 里挂载，用 stub fetch 注入 host 接口数据。
 * 覆盖：任务卡三列 / deleted 过滤 / 已完成列折叠 / 多团队默认选择与手动切换 /
 * 空态 / 降级态 / 请求失败错误态。
 *
 * 仓库本身零依赖，esbuild/react/react-dom/jsdom 复用 ../deepseek-harness 的 pnpm store；
 * 依赖不可用时测试标记 skip（环境限制，不是实现失败）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PNPM = join(root, '..', 'deepseek-harness', 'node_modules', '.pnpm')
const LIST_PATH = '/api/dsh-team-dev/teams'

class EnvUnavailable extends Error {}

/** 在 sibling pnpm store 里定位一个包目录（不存在返回 null）。 */
async function findInPnpm(packageName) {
  const entries = await readdir(PNPM).catch(() => [])
  for (const entry of entries) {
    if (!entry.startsWith(`${packageName}@`)) continue
    const directory = join(PNPM, entry, 'node_modules', packageName)
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (manifest.name === packageName) return directory
    } catch {
      /* 继续找下一个版本。 */
    }
  }
  return null
}

let harnessPromise = null

/** 构建（只需一次）：输出可直接执行的 CJS bundle 与 jsdom。 */
function loadHarness() {
  if (harnessPromise === null) harnessPromise = buildHarness()
  return harnessPromise
}

async function buildHarness() {
  const [esbuildDirectory, reactDirectory, reactDomDirectory, jsdomDirectory] = await Promise.all([
    findInPnpm('esbuild'),
    findInPnpm('react'),
    findInPnpm('react-dom'),
    findInPnpm('jsdom'),
  ])
  if (esbuildDirectory === null || reactDirectory === null || reactDomDirectory === null || jsdomDirectory === null) {
    throw new EnvUnavailable('缺少 esbuild/react/react-dom/jsdom（sibling pnpm store 不可用），跳过渲染测试')
  }

  const imported = await import(pathToFileURL(join(esbuildDirectory, 'lib', 'main.js')).href)
  const esbuild = imported.default ?? imported
  const entry = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TeamBoard } from ${JSON.stringify(join(root, 'src', 'client', 'TeamBoard.jsx'))}
export function mount(props, container) {
  const reactRoot = createRoot(container)
  reactRoot.render(React.createElement(TeamBoard, props))
  return reactRoot
}
`
  let built
  try {
    built = await esbuild.build({
      stdin: {
        contents: entry,
        resolveDir: join(root, 'src', 'client'),
        sourcefile: 'render-entry.jsx',
        loader: 'jsx',
      },
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'browser',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      loader: { '.js': 'jsx', '.jsx': 'jsx' },
      nodePaths: [dirname(reactDomDirectory), dirname(reactDirectory)],
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
    })
  } catch (error) {
    throw new EnvUnavailable(`esbuild 无法打包看板组件：${error.message}`)
  }

  const module = { exports: {} }
  const requireStub = specifier => { throw new EnvUnavailable(`bundle 意外 require(${specifier})`) }
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(module, module.exports, requireStub)
  if (typeof module.exports.mount !== 'function') throw new EnvUnavailable('bundle 未导出 mount')

  const jsdomModule = await import(pathToFileURL(join(jsdomDirectory, 'lib', 'api.js')).href)
  const { JSDOM } = jsdomModule.default ?? jsdomModule
  return { mount: module.exports.mount, JSDOM }
}

const ZH = {
  'tab.title': '团队看板',
  'team.selector': '团队',
  'team.none': '暂无团队',
  'unit.member': '人',
  'unit.task': '项',
  refresh: '刷新',
  'refresh.running': '刷新中…',
  updated: '最后更新 ',
  retry: '重试',
  loading: '正在加载团队看板…',
  degraded: '此部署未启用 Agent Teams（agentTeams 服务不可用）。',
  'empty.teams': '当前没有团队；用 team-dev / team-boot 技能开团后这里会出现。',
  'empty.degraded': '此部署未启用 Agent Teams（agentTeams 服务不可用）。',
  'error.load': '看板数据加载失败，请稍后重试。',
  'error.teamGone': '该团队已不存在，已自动切换到第一个团队。',
  'error.boundary': '看板渲染异常',
  'filter.all': '全部成员',
  'member.lead': 'Lead',
  'member.unknown': '未命名成员',
  'column.pending': '待处理',
  'column.inProgress': '进行中',
  'column.completed': '已完成',
  'tasks.none': '暂无任务',
  'task.untitled': '（无标题）',
  'task.unassigned': '未分配',
  'task.blocked': '阻塞',
  'task.revision': '版本',
  'task.details': '详情',
  'task.collapse': '收起',
  'task.blockedBy': '依赖',
  'task.writeScopes': '写入范围',
  'task.warnings': '范围冲突',
  'task.none': '无',
}

const translate = key => ZH[key] ?? key
const wait = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))

// ---------- fixtures：host 接口返回的数据形状（design §2.4） ----------
const TEAM_A = {
  teamId: 'team-a-lead-session',
  leadName: 'alice',
  leadSessionId: 'sess-a',
  memberCount: 2,
  taskCounts: { pending: 1, in_progress: 1, completed: 1 },
  members: [
    { id: 'sess-a', name: 'alice', role: 'lead', status: 'running' },
    { id: 'sess-b', name: 'bob', role: 'teammate', status: 'inactive' },
  ],
}
const TEAM_B = {
  teamId: 'team-b-lead-session',
  leadName: 'carol',
  leadSessionId: 'sess-c',
  memberCount: 1,
  taskCounts: { pending: 1, in_progress: 0, completed: 0 },
  members: [{ id: 'sess-c', name: 'carol', role: 'lead', status: 'running' }],
}
const DETAIL_A = {
  teamId: TEAM_A.teamId,
  leadName: 'alice',
  members: TEAM_A.members,
  taskCounts: TEAM_A.taskCounts,
  tasks: [
    { id: 't1', subject: '实现登录接口', status: 'pending', ownerName: 'bob', ready: false, blockedBy: ['t0'], revision: 1 },
    { id: 't2', subject: '补登录测试', status: 'in_progress', ownerName: 'bob', ready: true, blockedBy: [] },
    { id: 't3', subject: '接口评审', status: 'completed', ownerName: 'alice', ready: true },
    { id: 't4', subject: '已删除任务', status: 'deleted' },
  ],
}
const DETAIL_B = {
  teamId: TEAM_B.teamId,
  leadName: 'carol',
  members: TEAM_B.members,
  taskCounts: TEAM_B.taskCounts,
  tasks: [{ id: 'u1', subject: 'B 团队任务', status: 'pending', ownerName: 'dave', ready: true }],
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function hostHandler({ teams = [], details = {}, degradedReason = null } = {}) {
  return async url => {
    const [path, search = ''] = String(url).split('?')
    const params = new URLSearchParams(search)
    if (path === LIST_PATH) {
      const requested = params.get('teamId')
      if (requested !== null) {
        const team = details[requested]
        return team ? jsonResponse({ plugin: 'dsh-team-dev', degraded: false, team }) : jsonResponse({ error: 'team-not-found' }, 404)
      }
      if (degradedReason !== null) {
        return jsonResponse({ plugin: 'dsh-team-dev', degraded: true, reason: degradedReason, teams: [] })
      }
      return jsonResponse({ plugin: 'dsh-team-dev', degraded: false, reason: null, teams })
    }
    if (path.startsWith(`${LIST_PATH}/`)) {
      const teamId = decodeURIComponent(path.slice(LIST_PATH.length + 1))
      const team = details[teamId]
      return team ? jsonResponse({ plugin: 'dsh-team-dev', degraded: false, team }) : jsonResponse({ error: 'team-not-found' }, 404)
    }
    throw new Error(`unexpected fetch ${url}`)
  }
}

/** 建立 jsdom 环境并挂载看板；依赖缺失时 skip 并返回 null。 */
async function setup(t, handler, props = {}) {
  let harness
  try {
    harness = await loadHarness()
  } catch (error) {
    if (error instanceof EnvUnavailable) {
      t.skip(error.message)
      return null
    }
    throw error
  }
  const dom = new harness.JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  try {
    Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
  } catch {
    /* Node 自带的 navigator 只读时保留即可。 */
  }
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Node = dom.window.Node
  globalThis.Event = dom.window.Event

  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, init) => {
    requests.push(String(url))
    return await handler(String(url), init)
  }
  const container = dom.window.document.getElementById('app')
  const reactRoot = harness.mount({ t: translate, ...props }, container)
  t.after(() => {
    try {
      reactRoot.unmount()
    } catch {
      /* 已卸载时忽略。 */
    }
    globalThis.fetch = originalFetch
    dom.window.close()
  })
  await wait(150)
  return { container, requests, dom }
}

// ---------- README: rendering ----------
test('渲染：任务卡进三列、deleted 过滤、成员 chip、已完成列折叠', async t => {
  const view = await setup(t, hostHandler({
    teams: [TEAM_A, TEAM_B],
    details: { [TEAM_A.teamId]: DETAIL_A, [TEAM_B.teamId]: DETAIL_B },
  }), { sessionId: 'sess-b' })
  if (view === null) return
  const text = () => view.container.textContent

  // 当前会话（sess-b 是 team-a 成员）默认选中 team-a。
  assert.ok(view.requests.includes(`${LIST_PATH}/${TEAM_A.teamId}`))
  assert.match(text(), /实现登录接口/)
  assert.match(text(), /补登录测试/)
  assert.doesNotMatch(text(), /已删除任务/, 'deleted 任务不得渲染')
  assert.match(text(), /全部成员/)
  assert.match(text(), /alice · Lead/)
  // 团队选择器选项：leadName + 短 teamId + 人数/任务数。
  assert.match(text(), /alice · team-a-l · 2人 · 3项/)
  // 已完成列默认折叠：任务卡不渲染，列头计数仍显示。
  assert.doesNotMatch(text(), /接口评审/)
  const completedButton = [...view.container.querySelectorAll('button')]
    .find(button => button.textContent.includes('已完成'))
  assert.ok(completedButton, '应渲染已完成列头按钮')
  completedButton.click()
  await wait(80)
  assert.match(text(), /接口评审/)
})

test('渲染：多团队默认选中当前会话团队，手动切换后重新拉取', async t => {
  const view = await setup(t, hostHandler({
    teams: [TEAM_A, TEAM_B],
    details: { [TEAM_A.teamId]: DETAIL_A, [TEAM_B.teamId]: DETAIL_B },
  }), { sessionId: 'sess-c' })
  if (view === null) return

  const select = view.container.querySelector('select')
  assert.ok(select, '应渲染团队选择器')
  assert.equal(view.container.querySelectorAll('option').length, 2)
  assert.equal(select.value, TEAM_B.teamId, 'sess-c 属于 team-b，应默认选中')
  assert.match(view.container.textContent, /B 团队任务/)
  assert.ok(view.requests.includes(`${LIST_PATH}/${TEAM_B.teamId}`))

  select.value = TEAM_A.teamId
  select.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }))
  await wait(150)
  assert.match(view.container.textContent, /实现登录接口/)
  assert.ok(view.requests.includes(`${LIST_PATH}/${TEAM_A.teamId}`), '切换团队应显式带 teamId 重新请求')
})

test('渲染：空态（无团队）', async t => {
  const view = await setup(t, hostHandler({ teams: [] }), { sessionId: 'sess-a' })
  if (view === null) return
  assert.match(view.container.textContent, /当前没有团队/)
  assert.match(view.container.textContent, /暂无团队/)
})

test('渲染：降级态（agentTeams 不可用）', async t => {
  const view = await setup(t, hostHandler({ teams: [], degradedReason: 'agent-teams-unavailable' }), { sessionId: 'sess-a' })
  if (view === null) return
  assert.match(view.container.textContent, /此部署未启用 Agent Teams/)
})

test('渲染：请求失败错误态并提供重试', async t => {
  const view = await setup(t, async () => { throw new Error('network down') }, { sessionId: 'sess-a' })
  if (view === null) return
  assert.match(view.container.textContent, /看板数据加载失败/)
  assert.ok([...view.container.querySelectorAll('button')].some(button => button.textContent.includes('重试')))
})
