/**
 * Package integrity smoke check: structure, skill frontmatter, module exports,
 * fail-loud config validation, and the bundled skill provider — everything
 * verifiable without a running DSH. Run `node scripts/verify.mjs`.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const plugin = await import('../lib/index.js')

assert.equal(plugin.name, 'dsh-team-dev')
assert.deepEqual(plugin.inject, ['agents', 'skills'])
assert.equal(typeof plugin.apply, 'function')

for (const skill of ['team-dev', 'team-boot']) {
  const body = await readFile(join(root, 'skills', skill, 'SKILL.md'), 'utf8')
  const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  assert.ok(frontmatter, `${skill}: SKILL.md frontmatter missing`)
  for (const key of ['name', 'description']) {
    assert.ok(new RegExp(`^${key}:\\s*\\S+`, 'm').test(frontmatter[1]), `${skill}: ${key} missing`)
  }
  assert.ok(new RegExp(`^name:\\s*${skill}\\s*$`, 'm').test(frontmatter[1]), `${skill}: name != dir`)
}

// Fail-loud validation without any DSH service: a minimal fake ctx exercises
// apply's config checks and the provider registration path.
function fakeCtx() {
  return {
    get: () => undefined,
    on: () => () => {},
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
const candidates = await globalThis.__teamDevProvider.list()
assert.equal(candidates.length, 2)
assert.deepEqual(candidates.map(candidate => candidate.name).sort(), ['team-boot', 'team-dev'])
assert.ok(candidates.every(candidate => candidate.source === 'bundled' && candidate.rank === 600))
const teamDev = candidates.find(candidate => candidate.name === 'team-dev')
const definition = await globalThis.__teamDevProvider.get(teamDev)
assert.ok(definition.content.includes('三道质量门'), 'team-dev body loads')
console.log('verify: ok — 2 skills, fail-loud config, provider registration, body loading')
