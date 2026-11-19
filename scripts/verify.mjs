/**
 * Package integrity smoke check: structure, skill frontmatter, module exports,
 * fail-loud config validation, the bundled skill provider, v0.4 路由 + references
 * 规则契约与客户端产物 — everything verifiable without a running DSH.
 *
 * 运行顺序（README 有说明）：
 *   node scripts/build.mjs         # host 半侧 → lib/index.js
 *   node scripts/build-client.mjs  # 浏览器半侧 → lib/client.js
 *   node scripts/verify.mjs        # 本文件
 * `node scripts/build.mjs` 末尾会自动跑一次本检查；此时若 lib/client.js 尚未构建，
 * 客户端契约段跳过并打印提示（不误报失败）。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const plugin = await import('../lib/index.js')
const changes = await import('../lib/session-changes.js')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

assert.equal(plugin.name, 'dsh-team-dev')
assert.deepEqual(plugin.inject, ['agents', 'skills'])
assert.equal(typeof plugin.apply, 'function')

// v0.4 policy：单一配置源；present 默认允许；notice 从 allowlist 生成。
assert.ok(plugin.DEFAULT_ALLOW.includes('present'), 'DEFAULT_ALLOW 必须包含 present')
const defaultPolicy = plugin.normalizePolicy({})
assert.equal(defaultPolicy.softThreshold, 20)
assert.equal(defaultPolicy.hardThreshold, 25)
assert.equal(defaultPolicy.onlyTeamMembers, true)
assert.deepEqual(plugin.normalizePolicy({ allow: ['present'] }).allow, ['present'])
assert.ok(plugin.softNotice(3, defaultPolicy).includes('present'), 'softNotice 必须从 allowlist 生成并含 present')

// 独立插件入口：同包不同插件，账本能力可单独卸载/测试。
assert.equal(changes.name, 'dsh-session-changes')
assert.ok(Array.isArray(changes.inject), 'session-changes: inject 必须是数组')
assert.equal(typeof changes.apply, 'function')
assert.equal(typeof changes.createLedger, 'function')
assert.equal(typeof changes.summarizeLedger, 'function')

// v0.2 客户端半侧：清单契约（缺一项都会导致浏览器侧加载不到看板）。
assert.equal(pkg.dsh?.client?.platform, 'web', 'package.json: dsh.client.platform 必须是 "web"')
assert.equal(pkg.exports['./client'], './lib/client.js', 'package.json: exports["./client"] 必须指向 lib/client.js')
assert.equal(pkg.exports['./session-changes'], './lib/session-changes.js', 'package.json: exports["./session-changes"] 必须指向 lib/session-changes.js')
assert.ok(pkg.files.includes('lib/client.js'), 'package.json: files 必须包含 lib/client.js')
assert.ok(pkg.files.includes('lib/session-changes.js'), 'package.json: files 必须包含 lib/session-changes.js')

// bundle patch：两个插件行必须同时存在，缺一个都会让对应能力不挂载。
const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
assert.ok(patch.includes('id: dsh-session-changes'), 'cordis.patch.yml: 缺少 dsh-session-changes 行')
assert.ok(patch.includes('name: dsh-team-dev/session-changes'), 'cordis.patch.yml: 缺少 dsh-team-dev/session-changes 入口')

for (const skill of ['team-dev', 'team-boot']) {
  const body = await readFile(join(root, 'skills', skill, 'SKILL.md'), 'utf8')
  const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  assert.ok(frontmatter, `${skill}: SKILL.md frontmatter missing`)
  for (const key of ['name', 'description']) {
    assert.ok(new RegExp(`^${key}:\\s*\\S+`, 'm').test(frontmatter[1]), `${skill}: ${key} missing`)
  }
  assert.ok(new RegExp(`^name:\\s*${skill}\\s*$`, 'm').test(frontmatter[1]), `${skill}: name != dir`)
}

// v0.4：规则拆成 SKILL 路由 + references；契约必须存在且可被引用。
const references = [
  'contract.md', 'delivery.md', 'engineering.md', 'orchestration.md',
  'quality.md', 'project-profile.md', 'examples.md', 'onboarding.md', 'budget.md',
]
for (const file of references) {
  const body = await readFile(join(root, 'skills', 'team-dev', 'references', file), 'utf8')
  assert.ok(body.length > 300, `team-dev: references/${file} 过短或缺失`)
}
const contract = await readFile(join(root, 'skills', 'team-dev', 'references', 'contract.md'), 'utf8')
for (const marker of ['L0', 'L1', 'L2', 'present', '本次无独立交付文件', 'team-out']) {
  assert.ok(contract.includes(marker), `contract.md: 缺少 ${marker}`)
}
const teamDevBody = await readFile(join(root, 'skills', 'team-dev', 'SKILL.md'), 'utf8')
assert.ok(teamDevBody.includes('contract.md'), 'team-dev: SKILL.md 未引用 contract.md')
assert.ok(teamDevBody.includes('10 项'), 'team-dev: SKILL.md 任务卡必须是 10 项')
assert.ok(teamDevBody.includes('present'), 'team-dev: SKILL.md 未提 present')
const teamBootBody = await readFile(join(root, 'skills', 'team-boot', 'SKILL.md'), 'utf8')
assert.ok(teamBootBody.includes('contract.md'), 'team-boot: 未指向 contract.md')
assert.ok(!teamBootBody.includes('## 多对话 / 多团队'), 'team-boot: 不应复制 team-dev 长规则')

// Fail-loud validation without any DSH service: a minimal fake ctx exercises
// apply's config checks and the provider registration path.
function fakeCtx() {
  return {
    get: () => undefined,
    on: () => () => {},
    // teamBoardApply 用可选注入注册本机路由；无宿主服务时回调不执行即可。
    inject: () => () => {},
    effect: (callback, label) => {
      assert.equal(typeof label, 'string')
      return () => { callback()() }
    },
    agents: { list: () => [] },
    skills: { registerProvider: (fn) => { globalThis.__teamDevProvider = fn() } },
  }
}

await assert.rejects(
  Promise.resolve().then(() => plugin.apply(fakeCtx(), { softThreshold: 1, onlyTeamMembers: false })),
  /softThreshold/,
  'softThreshold below 2 must throw',
)
await assert.rejects(
  Promise.resolve().then(() => plugin.apply(fakeCtx(), { softThreshold: 5, hardThreshold: 5, onlyTeamMembers: false })),
  /hardThreshold/,
  'hardThreshold must exceed softThreshold',
)

await plugin.apply(fakeCtx(), {})
await changes.apply(fakeCtx(), {})
const candidates = await globalThis.__teamDevProvider.list()
assert.equal(candidates.length, 2)
assert.deepEqual(candidates.map(candidate => candidate.name).sort(), ['team-boot', 'team-dev'])
assert.ok(candidates.every(candidate => candidate.source === 'bundled' && candidate.rank === 600))
const teamDev = candidates.find(candidate => candidate.name === 'team-dev')
const definition = await globalThis.__teamDevProvider.get(teamDev)
assert.ok(definition.content.includes('L0'), 'team-dev body loads (contract marker)')

// 客户端 bundle 契约 V1–V5（build-client.mjs 已硬校验；这里复验产出的文件）。
// 产物缺失时硬失败：package.json 的 files 已声明 lib/client.js，缺它就是不可发布的包。
let bundle
try {
  bundle = await readFile(join(root, 'lib', 'client.js'), 'utf8')
} catch (error) {
  if (error.code === 'ENOENT') {
    assert.fail('缺少 lib/client.js：先运行 node scripts/build-client.mjs，再重新构建/打包。')
  }
  throw error
}
assert.ok(bundle.includes('window.__ModuleLoader__.load'), 'client V1: loader 包装缺失')
assert.ok(bundle.includes(pkg.name), 'client V2: 模块 id 缺失')
for (const marker of ['sidebar.right.pane.tab', 'conversation.chat.turnTail', 'slots.register']) {
  assert.ok(bundle.includes(marker), `client V3: 注册标记 ${marker} 缺失`)
}
const bytes = Buffer.byteLength(bundle, 'utf8')
assert.ok(bytes <= 1.5 * 1024 * 1024, `client V4: bundle 过大（${bytes} 字节）`)

// V5：external 纯净度（与 build-client.mjs 同一规则；防止手改产物的旧包混入）。
const allowedExternals = new Set(['react', 'react-dom'])
const required = [...bundle.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1])
const offending = [...new Set(required)].filter(specifier => !allowedExternals.has(specifier))
assert.deepEqual(offending, [], `client V5: 产物 require 了非基线模块 ${offending.join(', ')}`)

// PREFIX 一致性：host 路由前缀与客户端请求前缀必须相同，防止单边改名导致看板整体 404。
const hostSource = await readFile(join(root, 'src', 'host', 'team-board.js'), 'utf8')
const clientSource = await readFile(join(root, 'src', 'client', 'api.js'), 'utf8')
const hostPrefix = /const PREFIX = '([^']+)'/.exec(hostSource)?.[1]
const clientPrefix = /const PREFIX = '([^']+)'/.exec(clientSource)?.[1]
assert.equal(hostPrefix, '/api/dsh-team-dev', 'host PREFIX 契约')
assert.equal(clientPrefix, hostPrefix, 'client 与 host 的 PREFIX 必须一致')

// session-changes 的 PREFIX 一致性：路由与客户端请求必须同前缀。
const changesHostSource = await readFile(join(root, 'src', 'session-changes', 'index.js'), 'utf8')
const changesClientSource = await readFile(join(root, 'src', 'client', 'SessionChanges.jsx'), 'utf8')
const changesHostPrefix = /const PREFIX = '([^']+)'/.exec(changesHostSource)?.[1]
const changesClientPrefix = /const PREFIX = '([^']+)'/.exec(changesClientSource)?.[1]
assert.equal(changesHostPrefix, '/api/dsh-session-changes', 'session-changes host PREFIX 契约')
assert.equal(changesClientPrefix, changesHostPrefix, 'session-changes client 与 host 的 PREFIX 必须一致')

console.log(`verify: ok — 2 skills, L0 contract, policy (present), provider registration, session-changes ledger, client: ok (${bytes} 字节)`)

