/**
 * dsh-team-dev composition entry: the generated budget guard, the bundled
 * skills provider (team-dev / team-boot) and the read-only team-board host
 * routes behind one plugin row. Hand-written fixed part.
 */
import { guardApply } from './guard.ts'
import { skillsApply } from './provider.js'
import { teamBoardApply } from './host/team-board.js'

export const name = 'dsh-team-dev'
export const inject = ['agents', 'skills']

export function apply(ctx, config = {}) {
  guardApply(ctx, config)
  skillsApply(ctx)
  // v0.2：团队看板 host 半侧（只读路由）。connection/agentTeams 缺失时内部自降级，
  // 不阻塞插件加载，因此顶层 inject 保持 ['agents','skills'] 不变（verify.mjs 依赖）。
  teamBoardApply(ctx)
  console.error('[dsh-team-dev] budget guard + bundled skills + team board installed')
}
