# dsh-team-dev

面向 DeepSeek Harness 的自包含「开发团队」插件包。一行插件行带来两项能力：

1. **步数预算守卫**——每个 agent 每回合的工具调用预算。软阈值（默认 20）向非 teammate 会话注入警告；硬阈值（默认 25）在**运行之前**拒绝所有受跟踪的非白名单调用，指导模型写 handoff、更新任务、向 Lead 汇报。白名单工具（`write`、`edit`、`team_task_update`、`send_message`）保持可用，让 agent 能收尾。默认 `onlyTeamMembers: true` 只约束 Agent Teams 的 teammate——Lead 永不受限。
2. **随包技能**——装插件即装技能：从包内 `skills/` 目录提供 `team-dev`（开发团队编排）与 `team-boot`（通用任务团队）两个 skill。项目级（rank 100）与用户级（rank 400）同名 skill 仍会覆盖这些随包技能（rank 600）。

零运行时依赖。

## 安装

### 作为本地包

```bash
# 1. 在 profile 的 package.json 增加依赖
#    "@jiecore/dsh-team-dev": "file:/绝对路径/jiecore-dsh-team-dev-0.1.0.tgz"
#    或发布后使用 git/npm 声明
# 2. 在 dsh.profile.bundles 里列出该 bundle（package.json）
#    "dsh.profile.bundles": [..., "@jiecore/dsh-team-dev"]
# 3. 重新安装并重启 DSH
cd "$DSH_HOME/profiles/web" && pnpm install
```

### 以补丁插入方式（单会话 profile，不列 bundle）

在 profile 的 `cordis.patch.yml` 追加：

```yaml
- insert:
    - id: dsh-team-dev
      name: '@jiecore/dsh-team-dev'
```

并在 profile 的 `package.json` 加入 `@jiecore/dsh-team-dev` 依赖，重新安装、重启。

## 验证

```bash
node scripts/verify.mjs          # 包完整性冒烟检查
# 安装并重启后的运行时自检：
grep "dsh-team-dev" "$DSH_HOME/../Logs/DSH Desktop/harness.log" | tail -2
# 预期出现: [dsh-team-dev] budget guard + bundled skills installed
# 再跑一个 teammate 任务，单回合超过 25 次工具调用时，第 26 次非白名单调用
# 必须被拒，反馈以 "Step budget exhausted: ..." 开头。
```

## 配置

行配置（默认值如下）：

```yaml
softThreshold: 20
hardThreshold: 25
allow: [write, edit, team_task_update, send_message]
include: []
exclude: []
onlyTeamMembers: true
```

配置错误在加载时大声失败（soft 低于 2、hard 不高于 soft）。

## 卸载

移除 bundle 行 / 补丁行与依赖，重新安装、重启。随包技能随包消失；同名项目级/用户级技能不受影响。

## 发布到 DSH 插件市场

桌面端市场通过 GitHub 发现插件（`discovery-github-compatibility-v1`）。把本包推送到公开 GitHub 仓库即可（`package.json` 已带 `dsh.bundle.patch` 清单）；市场的兼容性发现会按 `github:<repo>` 条目收录 version、`enginesDsh` 与 peer 依赖信息。

## 开发：本项目拥有源码

手写的守卫源码就在这里：`src/guard.ts`——唯一事实来源。`lib/index.js` 是构建产物
（`scripts/build.mjs`），请勿手改。

```bash
node scripts/build.mjs          # 把 src/ 打包成 lib/index.js 并跑冒烟检查
node scripts/export-to-harness.mjs   # 重新生成仓库侧的测试壳
cd ../deepseek-harness && pnpm exec vitest run packages/guard/step-budget
pnpm pack                      # 重新打包 tgz
```

`export-to-harness.mjs` 会生成仓库包 `packages/guard/step-budget/src/index.ts`
（补回 schemastery Config schema、身份行与真实 import），让 harness 保留类型检查、
覆盖率和 CI 门禁，并保留将来上游合入的入口。行为一致性由
`packages/guard/step-budget/tests/artifact-parity.spec.ts` 钉住：它把构建产物
`lib/index.js` 放进与测试壳相同的 agent-loop 测试台。

## 发布

DSH 市场支持两条收录渠道：

1. **npm（推荐）**——市场按 npm 包名收录 version / `enginesDsh` / peer 依赖事实，
   并内置 `registry.npmmirror.com` 中国镜像回退。本包零 peer 依赖，兼容性检查必然通过。

   ```bash
   npm login            # 仅一次；用你自己的账号
   npm publish          # 发布 @jiecore/dsh-team-dev@0.1.0
   ```

2. **GitHub 镜像（可选）**——公开 GitHub 仓库会进入市场的 `github:` 兼容清单，同时作为源码页。
   Gitee 不是市场安装源（归档路径不同），只建议当镜像用。

发布前把 `package.json` 的 `repository.url` 换成你的真实仓库地址；每次发版先跑
`node scripts/verify.mjs`，再递增 `version`。

## 升级自检（任何 DSH 升级之后）

1. `grep "dsh-team-dev" <harness.log> | tail -2`——必须有挂载标记、无导入错误。
2. `node scripts/verify.mjs`——包完整性。
3. 预算探针：teammate 任务单回合超过 25 次工具调用，第 26 次必须被拒；Lead 不受限。
4. 技能探针：会话输入 `/`，菜单里应出现 `team-dev` 与 `team-boot`。
