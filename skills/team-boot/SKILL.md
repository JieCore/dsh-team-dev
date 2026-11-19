---
name: team-boot
description: 快速拉起智能体团队：一次创建全部成员、并行派活、任务板跟踪依赖、统一验收后交付。与 team-dev 共用 contract、质量门与交付规则；用户说「开团」「拉起团队」「用智能体团队」「team-boot」时使用。
---

# Team Boot — 快速开团（team-dev 的轻量入口）

> 规则不在这里重复。先读 `../team-dev/references/contract.md` 的 L0；建队细节读 `../team-dev/references/orchestration.md`，收尾读 `../team-dev/references/delivery.md` 与 `../team-dev/references/quality.md`。

## 1. 开团前（1 分钟）

- 读 `contract.md`：L0（安全、质量、交付、最终声明）不可覆盖。
- 读项目规则：`AGENTS.md` / `CLAUDE.md` / `.dsh/team-guidelines.md` 及其指针；没有就写「项目规则：无」。
- 不值得开团就自己做：单文件 < 50 行且无接口变化。

## 2. 一次建队

- 按 `orchestration.md` 选最小阵型；一次建完全部成员，不边做边加。
- 任务卡 **10 项**（含「交付面」）；文件级 owner 零重叠；共享文件 Lead 独占。
- 每张卡写清：目标/路径、输入材料、适用准则、写作用域、禁止触碰、验收命令/DoD、交付面、依赖、汇报格式。

## 3. 并行派活

- 任务板是唯一状态源；依赖用 `blocked_by`；inactive 成员用 `send_message` 唤醒。
- 成员只改写作用域；不跑 git 写、不跑全量 build/test、不改任务结构。
- 进度看板 + 任务状态，不靠反复问成员。

## 4. 验收与交付

- 成员 complete 前自检（G1）；reviewer 按 `quality.md` 评审（G2）；tester 跑指定命令（G3）。
- 有 blocking/失败 → reopen 原 owner；修完重跑。
- Lead 收尾：项目 §A → 合并/清理 → 全量命令 → diff 核对 → L0 交付判定。
- 用户要打开的 artifact 用 `present`（1–3 个，Lead 调用）；`team-out/*` 是证据，不是 artifact。
- 最终回复写「交付物：<path>」或「本次无独立交付文件」。

## 5. 硬约束

- 没有 G1–G3 + L0 判定，不说「完成」。
- 项目规则可追加更严要求，不能覆盖 L0；冲突停下报告 Lead。
- 失败要大声：异常、降级、未验证项显式写出来。
