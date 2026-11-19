---
name: team-dev
description: 专业化开发团队编排：先读项目规则与项目简报，再按阵型一次建队，任务卡含交付面，最后过 G1–G3 并做 L0 交付判定（present 或声明无独立交付文件）。用户说「开个开发团队」「team-dev」「多人并行改代码」「拉个开发小组」时使用。
---

# Team Dev — 专业化开发团队（v0.4）

> 本文件是**路由**，不是完整规则。细节按阶段读 `references/`；L0 不可覆盖，项目规则只能追加。

## 0. 读哪几份

| 阶段 | 先读 | 产出 |
|---|---|---|
| 0 上手 | `contract.md`（L0）、`project-profile.md`、`onboarding.md`、`engineering.md` | `team-out/00-onboarding.md`（含项目规则清单） |
| 1 建队 | `orchestration.md` | 一次建完全部成员 + 10 项任务卡 |
| 2 派活 | `orchestration.md` §5–§6 | 任务板就绪、依赖 blocked_by、按文件零重叠 |
| 3 执行 | `budget.md`、任务卡 | 成员产出 + 证据，不扩范围 |
| 4 质量门 | `quality.md` | G1 自检、G2 评审、G3 测试/验收 |
| 5 收尾 | `delivery.md`、`quality.md` §10 | 交付报告 + 交付面判定 + 最终声明 |

规则文件都在技能目录 `references/` 下；任务卡写路径时用 `skills/team-dev/references/<file>`。

## 1. L0（不可覆盖，30 秒版）

- **安全**：不提交密钥/凭据；不执行破坏性命令；共享文件同一时刻只有一个 writer；跨会话/跨 worktree 先声明边界。
- **质量**：G1–G3 有命令输出或可复核证据；「应该可以」不算通过。
- **交付**：按 artifact 路由判定；用户要打开的产物用 `present`（1–3 个，Lead 收尾调用）；`team-out/*` 是证据，不是 artifact。
- **声明**：最终回复必须写「交付物：<path>」或「本次无独立交付文件」；不能静默跳过。
- 项目规则可覆盖 L1 默认，**不能覆盖 L0**；冲突时停下报告 Lead，由 Lead 裁决并写进交付报告。

完整定义、路由表、冲突升级见 `contract.md`。

## 2. 阶段 0：上手

1. 读 `contract.md`，记住 L0。
2. 按 `project-profile.md` 发现项目规则：`AGENTS.md`、`CLAUDE.md`、`.dsh/team-guidelines.md` 及其指针文件；只读与本次相关的条款。
3. 按 `onboarding.md` 产出 `team-out/00-onboarding.md`：构建/测试命令、入口、风险热区、项目规则路径与 §A 收尾要求。
4. 读 `engineering.md`，把「内置默认 + 项目追加」写进简报。
5. 没有项目规则就写明「项目规则：无」；不要假设。

## 3. 阶段 1：建队

- 先判断是否值得开团：单文件 < 50 行且无接口变化 → 自己做。
- 按 `orchestration.md` 选最小阵型；成员一次建完，不边做边加。
- 任务卡 **10 项**，缺一项不下发；必须有「交付面」（artifact 路径 / 无独立交付文件）。
- 每个文件只有一个 owner；共享文件 Lead 独占；写作用域零重叠。
- 任务卡「输入材料」写 `engineering.md` + 项目规则实际路径；「适用准则条款」写编号。

## 4. 阶段 2–3：派活与执行

- 任务板是唯一状态源；依赖用 `blocked_by`；inactive 成员用 `send_message` 唤醒，不重建。
- 成员开工先读输入材料；任务卡与规则冲突 → 停下报告 Lead，不自行裁决。
- 上游产物是输入不是事实；关键结论抽样回溯源码/命令（≥3 条）。
- 不扩写作用域、不动共享文件、不顺手重构；发现越界或跨会话冲突立即停。
- 预算：软/硬阈值由 policy 决定；到硬预算写 `team-out/handoff-<task-id>.md` 并回报，不静默继续。

## 5. 阶段 4：质量门

- **G1 自检**：成员 complete 前跑目标命令、查 `git status` 范围、列未验证项。
- **G2 评审**：reviewer 按 `quality.md` checklist；正确性/安全/契约/回归 → blocking；风格 → nit；每条给文件:行号 + 改法。
- **G3 测试/验收**：tester 跑任务卡指定命令；覆盖正常/边界/失败/回归；失败先归类（实现/测试/环境）。
- 有 blocking 或 G3 失败 → reopen 原 owner；修完重跑；不把「已修」当「已验证」。
- 质量门记录写 `team-out/review.md` / `test-report.md`；`team-out` 是证据，不进交付卡片。

## 6. 阶段 5：收尾（顺序不能反）

1. **项目 §A 先做**：按项目规则完成 KB 沉淀/交付说明；缺项不得标完成。
2. 合并/导出 worktree、清理临时目录；确认改动都在声明的会话根目录内。
3. Lead 亲自跑全量命令；`git diff --stat` 核对范围；修订上游错误。
4. 按 `quality.md` G3 终验：全量命令、diff 范围、交付报告、回滚方式。
5. **L0 交付判定**（`delivery.md`）：列出产物 → 路由 → 选 1–3 个 artifact → `present` 或声明无。
6. 写 `team-out/delivery-report.md`（含「交付面」段）；需要时 `present` 报告/产物。
7. 最终回复：结论、验证、改动、交付声明、风险；不要把报告全文粘进回复。

## 7. 硬约束

- git 写操作只有 Lead；成员只读/只改任务卡范围。
- `present` 只有 Lead 收尾调用；成员不调用。
- `team-out/*` 是证据，不是 artifact；不要用报告凑交付卡片。
- 没有 G1–G3 + L0 判定，不说「完成」；没有 artifact 就明确声明，不静默。
- 规则冲突：L0 > 项目规则（L1）> 内置 L1 默认 > 任务卡；项目规则不能吞 L0。
- 多会话：一个会话 = 一个团队；跨团队只走 Lead ↔ Lead；共享文件同时只有一个 writer。
- 失败要大声：异常/降级/未验证项显式写出来。

## 8. 与 team-boot 的关系

`team-boot` 是同一 contract 的快速别名：只做「一次建队 + 并行派活 + 统一验收」，阶段 0/4/5 的规则仍以本文件和 `references/` 为准。
