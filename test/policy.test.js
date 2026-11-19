import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_ALLOW,
  normalizePolicy,
  completionList,
  softNotice,
  finalNotice,
  hardFeedback,
} from '../lib/index.js'

test('default policy includes the delivery surface and keeps thresholds', () => {
  const policy = normalizePolicy()
  assert.equal(policy.softThreshold, 20)
  assert.equal(policy.hardThreshold, 25)
  assert.equal(policy.onlyTeamMembers, true)
  assert.ok(policy.allow.includes('present'), 'present must stay callable at the hard limit')
  assert.deepEqual(policy.allow, [...DEFAULT_ALLOW])
})

test('custom allowlist replaces the default and is copied', () => {
  const source = ['write', 'present']
  const policy = normalizePolicy({ softThreshold: 4, hardThreshold: 6, allow: source, onlyTeamMembers: false })
  assert.equal(policy.softThreshold, 4)
  assert.equal(policy.hardThreshold, 6)
  assert.equal(policy.onlyTeamMembers, false)
  assert.deepEqual(policy.allow, source)
  assert.notEqual(policy.allow, source, 'policy must own its list')
  assert.equal(completionList(policy), 'write / present')
})

test('threshold misconfiguration fails loud', () => {
  assert.throws(() => normalizePolicy({ softThreshold: 1 }), /softThreshold/)
  assert.throws(() => normalizePolicy({ softThreshold: 5, hardThreshold: 5 }), /hardThreshold/)
  assert.throws(() => normalizePolicy({ softThreshold: 5, hardThreshold: 4 }), /hardThreshold/)
})

test('notices are generated from the allowlist, not hard-coded tool names', () => {
  const policy = normalizePolicy({ allow: ['write', 'present'] })
  for (const text of [softNotice(20, policy), finalNotice(25, policy), hardFeedback(25, policy)]) {
    assert.match(text, /write \/ present/)
    assert.doesNotMatch(text, /team_task_update/)
  }
  assert.match(softNotice(20, policy), /hard limit 25/)
  assert.match(finalNotice(25, policy), /last call/i)
  assert.match(hardFeedback(25, policy), /blocked/i)
})

test('default notices mention present as a valid completion/delivery call', () => {
  const policy = normalizePolicy()
  assert.match(softNotice(20, policy), /present/)
  assert.match(finalNotice(25, policy), /present/)
  assert.match(hardFeedback(25, policy), /present/)
})
