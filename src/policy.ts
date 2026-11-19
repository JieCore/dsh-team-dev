/**
 * Team-dev runtime policy: one source of truth for budget thresholds, the
 * completion allowlist, and the notices the guard injects. The guard imports
 * this module; `scripts/export-to-harness.mjs` inlines it into the harness
 * facade so the upstream package keeps a single behavioral source.
 *
 * The default allowlist deliberately includes `present`: a teammate that has
 * finished its work may need to hand a user-facing artifact to the Lead, and a
 * Lead under `onlyTeamMembers: false` must be able to use the delivery surface
 * without tripping the budget. The notices are generated from the allowlist so
 * documentation and behavior cannot drift.
 */

export interface PolicyConfig {
  /** Tracked-call count that triggers the budget warning (default `20`). */
  softThreshold?: number
  /** Tracked-call count whose crossing blocks non-allowlisted calls (default `25`). */
  hardThreshold?: number
  /**
   * Tool-name patterns that keep working after the hard threshold. The default
   * is the completion path plus the delivery surface (`present`). Patterns are
   * `*` wildcards over tool names, not registry references.
   */
  allow?: string[]
  /** Tool-name patterns to track; empty means every tool is tracked. */
  include?: string[]
  /** Tool-name patterns transparent to the budget (neither count nor block). */
  exclude?: string[]
  /**
   * When `true` (default), only Agent-Team teammates are budgeted. When
   * `false`, every agent is budgeted.
   */
  onlyTeamMembers?: boolean
}

export interface NormalizedPolicy {
  softThreshold: number
  hardThreshold: number
  allow: string[]
  include: string[]
  exclude: string[]
  onlyTeamMembers: boolean
}

/** Tools that remain callable after the hard threshold, including delivery. */
export const DEFAULT_ALLOW: readonly string[] = [
  'write',
  'edit',
  'team_task_update',
  'send_message',
  'present',
]

/**
 * Validate and fill the runtime policy. Threshold misconfiguration fails loud
 * at plugin load; list fields are copied so callers cannot mutate the policy
 * after validation.
 */
export function normalizePolicy(config: PolicyConfig = {}): NormalizedPolicy {
  const softThreshold = config.softThreshold ?? 20
  const hardThreshold = config.hardThreshold ?? 25
  if (!Number.isInteger(softThreshold) || softThreshold < 2) {
    throw new Error(`dsh-team-dev: invalid softThreshold ${softThreshold} — must be an integer >= 2`)
  }
  if (!Number.isInteger(hardThreshold) || hardThreshold <= softThreshold) {
    throw new Error(`dsh-team-dev: invalid hardThreshold ${hardThreshold} — must be an integer > softThreshold ${softThreshold}`)
  }
  return {
    softThreshold,
    hardThreshold,
    allow: [...(config.allow ?? DEFAULT_ALLOW)],
    include: [...(config.include ?? [])],
    exclude: [...(config.exclude ?? [])],
    onlyTeamMembers: config.onlyTeamMembers ?? true,
  }
}

/** Render the allowlist for a model-facing notice without hard-coding tool names. */
export function completionList(policy: NormalizedPolicy): string {
  return policy.allow.join(' / ')
}

/** Soft-threshold warning injected while work may still continue. */
export function softNotice(used: number, policy: NormalizedPolicy): string {
  return `Step budget warning: this turn has used ${used} tracked tool calls (hard limit ${policy.hardThreshold}). `
    + 'If the task cannot finish within the remaining budget, stop exploring now and prepare a handoff: '
    + `write a handoff file, report your progress to the Lead, and wait for the Lead to extend the budget or shrink the scope. `
    + `Allowed completion tools: ${completionList(policy)}.`
}

/** Last-allowed-call warning injected exactly when the hard threshold is reached. */
export function finalNotice(used: number, policy: NormalizedPolicy): string {
  return `Step budget limit reached: this turn has used ${used} tracked tool calls (hard limit ${policy.hardThreshold}). `
    + 'This is the last call allowed outside the completion allowlist. After it, finish with '
    + `${completionList(policy)}: write a handoff file, update your task status, present any user-facing artifact, and report to the Lead.`
}

/** Feedback on a refused call — the model sees it as the tool result and must finish via the allowlist. */
export function hardFeedback(used: number, policy: NormalizedPolicy): string {
  return `Step budget exhausted: this turn has used ${used} tracked tool calls (hard limit ${policy.hardThreshold}). `
    + `Further tool calls are blocked except the completion allowlist (${completionList(policy)}). `
    + 'Do not retry the blocked call. Finish gracefully now: write a handoff file with what is done and what remains, '
    + 'present any user-facing artifact, update your task status, and report to the Lead.'
}
