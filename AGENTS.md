# dsh-team-dev 工作区约定

DSH 开发团队插件：bundle（步数预算守卫 + 随包 team-dev/team-boot 技能）+ 只读团队看板。零运行时依赖。

## 命令

- 宿主半侧：`node scripts/build.mjs`（src → lib/index.js）
- 浏览器半侧：`node scripts/build-client.mjs`（src/client → lib/client.js）
- 契约自检：`node scripts/verify.mjs`；测试：`node --test test/*.test.js`
- 打包：`pnpm pack`

## 目录

`src/host/` 宿主路由 · `src/guard.ts` 步数预算 · `src/client/` 看板 · `skills/` 随包技能 · `lib/` 构建产物（勿手改）

## 共享记忆

改代码前若涉及“为什么这么设计 / 以前踩过什么坑”，先检索再动手：

```
grep "<关键词>" .dsh/kb
```

命中就 `read` 该页；检索不到按代码（L1）执行，别把笔记当事实。**结论只在收尾时写回**，格式见 `.dsh/kb/README.md`。

## 禁区

- 不手改 `lib/`；改 `src/` 后重新构建
- 不覆盖宿主组合里别人的行；新增能力只走 `cordis.patch.yml`
- git 提交 / 分支操作仅 Lead
- 文档与代码冲突：以代码为准，并修正文档
