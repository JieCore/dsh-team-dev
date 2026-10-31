/**
 * dsh-team-dev composition entry: the generated budget guard plus the bundled
 * skills provider behind one plugin row. Hand-written fixed part — the guard
 * body is generated into src/guard.ts by scripts/sync.mjs.
 */
import { guardApply } from './guard.ts'
import { skillsApply } from './provider.js'

export const name = 'dsh-team-dev'
export const inject = ['agents', 'skills']

export function apply(ctx, config = {}) {
  guardApply(ctx, config)
  skillsApply(ctx)
  console.error('[dsh-team-dev] budget guard + bundled skills installed')
}
