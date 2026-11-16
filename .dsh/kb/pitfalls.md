# 踩坑记录

一行一条：**现象 → 原因 → 规避**。新坑追加在末尾，不改历史条目。

- **多会话并行开团互相覆盖文件** → 同一 workspace 的多个会话共用文件系统 → v0.2.3 起由 Lead 用 `create_worktree` / `git worktree add`（非 git 项目用目录拷贝）建立独立工作目录，任务卡记录会话根目录与写作用域；共享文件同一时刻只允许一个会话修改。
- **预设 / 配置副本没有升级通道** → 预设作者机制是 copy-only，用户复制出去的副本不会被包更新覆盖；`standard` 预设升级后副本静默落后 → 如需预设化，只从包内只读 root 发布，禁止让用户复制；文件头标注来源版本并加 CI 比对。
- **客户端 bundle 无法按会话 / 预设卸载** → `ctx.clientModules` 按已安装包扫描组成 `__DSH_BOOT__` 入口图，与预设无关 → 只能靠会话投影 `agentPreset` 做视觉门控；不要承诺"只有某类会话才有该 UI"。
- **`AGENTS.md` 吃满指令预算** → `dsh-agent-instructions` 预算 65536 字节，宽泛文件先被省略、最具体的先被截断 → 根 `AGENTS.md` 压到 ≤2KB 只放常驻规则，细节挪到子目录嵌套文件（懒加载）或 `.dsh/kb/`（按需读）。
- **成员筛选按名字匹配会漏掉未命名成员** → DSH 0.2.2 起 `TeamTaskView` 认领任务只带 `ownerId`（`ownerName` 仅在 `namesOf(caller).self !== caller.id` 时才有，见 dsh-agent-team `lib/index.js` 的 `ownerId: caller.id` 分支），而 `name` 为空的成员没有可比的 `ownerName`；旧看板还 `if (!member.name) return` 直接吞点击 → 一律按 `ownerId` 归属、无 `ownerId` 且团队有 ownerId 形态即判无主，名字匹配只留给完全不下发 ownerId 的旧宿主：`src/client/TeamBoard.jsx:142 taskOwnedBy`、`:164 taskOwnerLabel`、`:437 tasksHaveOwnerId`；单测 `test/client-render.test.js` 末尾两条。
