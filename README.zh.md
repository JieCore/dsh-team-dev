# dsh-team-dev

面向 DeepSeek Harness 的自包含「开发团队」插件包。一行插件行带来三项能力：

1. **步数预算守卫**——每个 agent 每回合的工具调用预算。软阈值（默认 20）向非 teammate 会话注入警告；硬阈值（默认 25）在**运行之前**拒绝所有受跟踪的非白名单调用，指导模型写 handoff、更新任务、向 Lead 汇报。白名单工具（`write`、`edit`、`team_task_update`、`send_message`）保持可用，让 agent 能收尾。默认 `onlyTeamMembers: true` 只约束 Agent Teams 的 teammate——Lead 永不受限。
2. **随包技能**——装插件即装技能：从包内 `skills/` 目录提供 `team-dev`（开发团队编排）与 `team-boot`（通用任务团队）两个 skill。`team-dev` 另随包提供**内置开发准则**（`skills/team-dev/guidelines.md`，含前端列表排序规范）并支持项目级覆盖。项目级（rank 100）与用户级（rank 400）同名 skill 仍会覆盖这些随包技能（rank 600）。
3. **团队看板（v0.2，浏览器半侧）**——Web UI 右侧栏的只读看板：按状态（待开始 / 进行中 / 已完成）分列、按角色/成员筛选，多对话时用团队下拉切换。数据来自两条只读 host 路由（`/api/dsh-team-dev/teams`、`/api/dsh-team-dev/teams/<teamId>`）；不写数据、不落缓存、不新增运行时依赖。

零运行时依赖。浏览器半侧构建为 `lib/client.js`，由宿主的客户端模块系统按 `dsh.client` 声明加载。

## 安装

### 作为本地包

```bash
# 1. 在 profile 的 package.json 增加依赖
#    "dsh-team-dev": "file:/绝对路径/dsh-team-dev-0.2.0.tgz"
#    或发布后使用 git/npm 声明
# 2. 在 dsh.profile.bundles 里列出该 bundle（package.json）
#    "dsh.profile.bundles": [..., "dsh-team-dev"]
# 3. 重新安装并重启 DSH
cd "$DSH_HOME/profiles/web" && pnpm install
```

### 以补丁插入方式（单会话 profile，不列 bundle）

在 profile 的 `cordis.patch.yml` 追加：

```yaml
- insert:
    - id: dsh-team-dev
      name: dsh-team-dev
```

并在 profile 的 `package.json` 加入 `dsh-team-dev` 依赖，重新安装、重启。

## 团队看板 / 多团队（v0.2）

- 打开 Web UI **右侧栏的「团队看板」页签**（默认 web-app 自带 `ui-sidebar-right`，不需要额外安装）。
- **一个主会话 = 一个隐式 Agent Team**（`TeamId = root SessionId`）。同时开多个对话就有多个互不干扰的团队；看板顶部的团队下拉会列出全部团队，并默认选中当前会话所属团队。
- 看板**只读**：任务的创建 / 认领 / 更新仍走 Agent Teams 工具（`team_task_*`）。每 5 秒自动刷新；页签隐藏时暂停，失败按 5/15/30 秒退避，切换团队/手动刷新会取消在途请求。
- 详情由 `/api/dsh-team-dev/teams/<teamId>` 提供：宿主的本机路由是精确路径匹配，因此 host 在每次团队列表请求后为每个在线团队注册一条精确路由（同样的数据另有 `?teamId=` 查询兜底）。
- 部署未启用 Agent Teams 时，插件照常加载，看板显示「此部署未启用 Agent Teams」的降级空态（host 返回 `degraded: true`）。若连 `connection` 服务都缺失，则不会注册看板路由：插件仍能加载，但看板显示加载失败（检查安装 / 重启）。
- 跨团队隔离：一次只看一个团队；任务、成员、写作用域不会在不同团队之间混排。

## 开发准则（v0.2）

- 内置：`skills/team-dev/guidelines.md`——通用工程准则、前后端契约、数据与安全、排序与命名（含 **§5.2 前端列表排序规范**）、本仓库契约、三道质量门。
- 覆盖：Lead 开工前先读项目级 `AGENTS.md` / `CLAUDE.md` / `.dsh/team-guidelines.md`（优先级最高）；未覆盖的条款回退内置文件。任务卡「输入材料」与「适用准则条款」必须写明两者。
- 成员开工前读任务卡引用的准则条款；发现任务卡与准则冲突时报告 Lead，不得静默按冲突要求实现。

## 验证

```bash
node scripts/build.mjs          # host 半侧 → lib/index.js
node scripts/build-client.mjs   # 浏览器半侧 → lib/client.js（V1–V5 断言）
node scripts/verify.mjs         # 包完整性 + 客户端产物契约
# 安装并重启后的运行时自检：
grep "dsh-team-dev" "$DSH_HOME/../Logs/DSH Desktop/harness.log" | tail -2
# 预期出现: [dsh-team-dev] budget guard + bundled skills + team board installed
# 再跑一个 teammate 任务，单回合超过 25 次工具调用时，第 26 次非白名单调用
# 必须被拒，反馈以 "Step budget exhausted: ..." 开头。
```

## 配置

行配置（默认值如下）。看板只读，无额外配置。

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

移除 bundle 行 / 补丁行与依赖，重新安装、重启。随包技能与看板随包消失；同名项目级/用户级技能不受影响。

## 发布到 DSH 插件市场

桌面端市场通过 GitHub 发现插件（`discovery-github-compatibility-v1`）。把本包推送到公开 GitHub 仓库即可（`package.json` 已带 `dsh.bundle.patch` 清单）；市场的兼容性发现会按 `github:<repo>` 条目收录 version、`enginesDsh` 与 peer 依赖信息。

## 开发：本项目拥有源码

手写的守卫源码就在这里：`src/guard.ts`——唯一事实来源。host 半侧是
`src/index.js` + `src/host/team-board.js`；浏览器半侧是 `src/client/`。
`lib/index.js` 与 `lib/client.js` 都是构建产物，请勿手改。

```bash
node scripts/build.mjs               # 把 host 侧 src/ 打包成 lib/index.js 并跑冒烟检查
node scripts/build-client.mjs        # 把 src/client/ 打包成 lib/client.js（V1–V5 校验）
node scripts/export-to-harness.mjs   # 重新生成仓库侧的测试壳
cd ../deepseek-harness && pnpm exec vitest run packages/guard/step-budget
pnpm pack                            # 重新打包 tgz
```

`export-to-harness.mjs` 会生成仓库包 `packages/guard/step-budget/src/index.ts`
（补回 schemastery Config schema、身份行与真实 import），让 harness 保留类型检查、
覆盖率和 CI 门禁，并保留将来上游合入的入口。行为一致性由
`packages/guard/step-budget/tests/artifact-parity.spec.ts` 钉住：它把构建产物
`lib/index.js` 放进与测试壳相同的 agent-loop 测试台。

浏览器产物格式遵循宿主客户端模块加载器：`window.__ModuleLoader__.load({ id,
factory })` 的 lazy-CJS 包装，React 保持 external。`scripts/build-client.mjs` 与
host 构建一样从 sibling `deepseek-harness` 找 esbuild，并在产物丢失 loader 包装、
模块 id、`sidebar.right.pane.tab` 注册标记或体积超过 1.5 MB 时硬失败。

## 发布

DSH 市场支持两条收录渠道：

1. **npm（推荐）**——市场按 npm 包名收录 version / `enginesDsh` / peer 依赖事实，
   并内置 `registry.npmmirror.com` 中国镜像回退。本包零 peer 依赖，兼容性检查必然通过。

   ```bash
   npm login            # 仅一次；用你自己的账号
   npm publish          # 发布 dsh-team-dev@0.2.0
   ```

2. **GitHub 镜像（可选）**——公开 GitHub 仓库会进入市场的 `github:` 兼容清单，同时作为源码页。
   Gitee 不是市场安装源（归档路径不同），只建议当镜像用。

发布前把 `package.json` 的 `repository.url` 换成你的真实仓库地址；每次发版先跑
`node scripts/verify.mjs`，再递增 `version`。

## 升级自检（任何 DSH 升级之后）

1. `grep "dsh-team-dev" <harness.log> | tail -2`——必须有挂载标记、无导入错误。
2. `node scripts/verify.mjs`——包完整性（host + 客户端契约 + 内置准则）。
3. 预算探针：teammate 任务单回合超过 25 次工具调用，第 26 次必须被拒；Lead 不受限。
4. 技能探针：会话输入 `/`，菜单里应出现 `team-dev` 与 `team-boot`。
5. 看板探针：右侧栏出现「团队看板」页签；有团队时能看到任务与团队下拉。若部署未启用 Agent Teams，必须显示降级空态而不是拖垮侧栏。
