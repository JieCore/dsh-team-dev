# 默认编制（并行模式）

三个角色读同一份用户材料/工作区，**互不依赖**，各自产出，Lead 最后合并裁决。

| name | context | 职责 | 交付物 |
|---|---|---|---|
| researcher | fresh | 只查事实与证据：来源、文件:行号、数据、原话 | `<工作区>/team-out/01-research.md` |
| analyst | fresh | 只做判断与建议：结论、方案、优先级、取舍 | `<工作区>/team-out/02-analysis.md` |
| reviewer | fresh | 只挑风险与反例：错误、边界、遗漏、反例 | `<工作区>/team-out/03-review.md` |

这样拆的原因：三者都基于同一份输入，不需要互相等，因此可以同时开跑。Lead 最后负责合并与裁决。

## 流水线模式（任务天然有依赖时）

把角色换成阶段，例如：调研 → 实现 → 评审。此时：

- 任务用 `blocked_by` 表达阶段依赖；
- **成员仍在创建阶段一次建完**，下游 prompt 写「任务 blocked 时立刻回报待命并结束本轮」；
- 上游完成后由 Lead `send_message` 唤醒下游。

## prompt 骨架（Lead 必填）

- 你是 teammate，不是 Lead；工作目录；所有成员共享文件系统。
- 任务 id + 流程：`team_task_get` → `claim`（带 expected_revision）→ 做事 → `complete`（最新 revision）→ 回报。
- 只写你的交付物和任务卡允许的文件；不建成员、不给别人发消息、不改任务板结构。
- 流水线模式加一句：先看 `team_task_get` 的 `ready`；未就绪时不要 claim，立刻回报「待命」并结束本轮，不要空转。
- 回报 ≤5 行：文件路径、行数、关键结论、不确定点。

## 选择建议

- 2 人以下能做完 → 不开团。
- 需要 4–8 人时按同格式追加，`name` 唯一、lower-kebab-case。
- 各角色交付物文件名用序号前缀，方便 Lead 按顺序合并。
