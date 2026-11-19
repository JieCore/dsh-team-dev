# 收尾示例（按 artifact 路由）

> 只示范「怎么判定 + 怎么声明」；质量门和项目 §A 不在这里重复。

## 1. 纯代码修复

- 产物：`src/a.ts`、`test/a.test.ts`
- 路由：代码 → 改动卡片 + 正文
- `present`：否
- 最终回复：

```text
修好了 a 的边界问题，单测 12/12 通过。
验证：node --test test/a.test.ts
改动：src/a.ts、test/a.test.ts（见改动卡片）
交付物：本次无独立交付文件
风险：未跑全量集成测试
```

## 2. 代码 + 正式验收报告

- 产物：代码 + `team-out/27-p5-delivery.md`
- 路由：代码 → 改动卡片；报告是验收/交接产物 → 交付卡片
- `present`：是，只放报告
- 最终回复：

```text
P5 完成，全量 55/55 通过；报告含改动、验证、风险与回滚。
验证：node --test test/*.test.js
改动：见改动卡片
交付物：team-out/27-p5-delivery.md（已 present）
风险：真实 UI 未安装验证
```

## 3. 文档 / 表格 / 演示

- 产物：`report.md`、`data.xlsx`
- 路由：两者都是用户要打开的产品 → 交付卡片
- `present`：是，1–2 个
- 最终回复：

```text
报告和数据表已生成，含口径说明与原始数据来源。
交付物：report.md、data.xlsx（已 present）
风险：数据截止 2026-11-16
```

## 4. 反例

- 每个文件都 `present`：卡片噪声；只放 1–3 个用户要打开的。
- `present` 源码 diff：与改动卡片重复；源码交给改动卡片/PR。
- 把 `team-out/review.md` 当 artifact：用户拿到内部工作记录；正文链接即可。
- 没有 artifact 却硬 `present`：空卡片/凑数；写「本次无独立交付文件」。
- 正文只写链接、不调用 `present`：不会产生交付卡片；需要卡片就调用，不需要就声明。
