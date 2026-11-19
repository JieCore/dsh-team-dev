import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')

test('SKILL.md is a router, not the old long rulebook', async () => {
  const body = await read('skills/team-dev/SKILL.md')
  const lines = body.split('\n').length
  assert.ok(lines <= 170, `SKILL.md 过长（${lines} 行）；规则应下沉到 references/`)
  assert.ok(body.includes('contract.md'), 'SKILL.md 必须指向 contract.md')
  assert.ok(body.includes('10 项'), 'SKILL.md 任务卡必须是 10 项')
  assert.ok(body.includes('present'), 'SKILL.md 必须包含交付面')
  assert.ok(!body.includes('skills/team-dev/guidelines.md'), 'SKILL.md 不应再引用旧 guidelines.md')
})

test('contract defines non-overridable L0/L1/L2 and delivery surface', async () => {
  const body = await read('skills/team-dev/references/contract.md')
  for (const marker of ['L0', 'L1', 'L2', 'present', '本次无独立交付文件', 'team-out']) {
    assert.ok(body.includes(marker), `contract.md 缺少 ${marker}`)
  }
  assert.match(body, /完成\s*≠\s*交付|完成不等于交付/, 'contract 必须区分完成与交付')
})

test('task card and quality gates include delivery surface', async () => {
  const task = await read('skills/team-dev/references/orchestration.md')
  assert.ok(task.includes('10 项'), '任务卡必须是 10 项')
  assert.ok(task.includes('交付面'), '任务卡必须包含交付面')
  assert.ok(task.includes('engineering.md'), '任务卡必须指向 engineering.md')
  assert.ok(task.includes('quality.md'), 'reviewer 必须指向 quality.md')
  assert.ok(!task.includes('skills/team-dev/guidelines.md'), '任务卡不应再引用旧 guidelines.md')

  const quality = await read('skills/team-dev/references/quality.md')
  assert.ok(quality.includes('L0 交付判定'), 'G3 必须包含 L0 交付判定')
  assert.ok(quality.includes('delivery.md'), 'quality 必须指向 delivery.md')
  assert.ok(!quality.includes('## 9. 交付报告模板'), '报告模板应只在 delivery.md 维护')
})

test('project rules are discovered, not assumed', async () => {
  const body = await read('skills/team-dev/references/project-profile.md')
  assert.ok(body.includes('AGENTS.md'))
  assert.ok(body.includes('CLAUDE.md'))
  assert.ok(body.includes('.dsh/team-guidelines.md'))
  assert.ok(body.includes('项目 §A'))
  assert.ok(body.includes('不能覆盖 L0'))
})

test('team-boot is a thin alias over the same contract', async () => {
  const body = await read('skills/team-boot/SKILL.md')
  assert.ok(body.includes('../team-dev/references/contract.md'), 'team-boot 必须指向 contract.md')
  assert.ok(body.includes('10 项'), 'team-boot 任务卡也必须是 10 项')
  assert.ok(body.includes('present'), 'team-boot 必须包含交付面')
  assert.ok(body.split('\n').length <= 90, 'team-boot 不应复制长规则')
})
