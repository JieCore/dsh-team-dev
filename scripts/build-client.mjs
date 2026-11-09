/**
 * 构建浏览器半侧单文件模块（dsh-team-dev 看板）。
 *
 * DSH 的客户端模块系统只加载 `dsh.client` 声明包的 `./client` 产物，并把它交给
 * 页面里的 loader。产物必须是 lazy-CJS factory：`window.__ModuleLoader__.load({
 * id, factory })`，factory 返回 module.exports（含 apply / inject）。React 保持
 * external，由宿主共享基线提供，避免打进第二份 React。
 *
 * esbuild 不在本仓库依赖中（宿主构建同样借用 sibling 仓库的 esbuild），脚本按
 * 以下顺序查找：ESBUILD_PATH → 本地 node_modules → ../deepseek-harness 的
 * node_modules 与 .pnpm 目录。
 *
 * 产物契约校验（对应 team-out/design.md §4.3 V1–V5）：
 *   V1 loader 包装  V2 模块 id  V3 注册标记  V4 体积上限  V5 external 纯净度
 *
 * 用法：node scripts/build-client.mjs
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const ENTRY = join(root, 'src', 'client', 'index.jsx')
const OUTPUT = join(root, 'lib', 'client.js')
/** V4：客户端单文件上限；超过说明误把宿主依赖打进产物。 */
const MAX_BUNDLE_BYTES = 1.5 * 1024 * 1024
/** V5：允许保持 external 的宿主模块基线。 */
const ALLOWED_EXTERNALS = new Set(['react', 'react-dom'])
/** V3：客户端入口必须出现的注册标记。 */
const REQUIRED_MARKERS = ['sidebar.right.pane.tab', 'slots.register']

async function findEsbuild() {
  const candidates = []
  if (process.env.ESBUILD_PATH) candidates.push(process.env.ESBUILD_PATH)
  candidates.push(join(root, 'node_modules', 'esbuild'))
  candidates.push(join(root, '..', 'deepseek-harness', 'node_modules', 'esbuild'))
  try {
    const pnpm = join(root, '..', 'deepseek-harness', 'node_modules', '.pnpm')
    for (const name of await readdir(pnpm)) {
      if (name.startsWith('esbuild@')) candidates.push(join(pnpm, name, 'node_modules', 'esbuild'))
    }
  } catch {
    /* 没有 sibling pnpm 目录时忽略，继续试下一个候选。 */
  }
  for (const directory of candidates) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (manifest.name === 'esbuild') return directory
    } catch {
      /* 该候选不可用，试下一个。 */
    }
  }
  throw new Error('找不到 esbuild：请设置 ESBUILD_PATH，或把本仓库与 deepseek-harness 放在同一父目录。')
}

const esbuildDirectory = await findEsbuild()
const imported = await import(pathToFileURL(join(esbuildDirectory, 'lib', 'main.js')).href)
const esbuild = imported.default ?? imported

const result = await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome120', 'safari17'],
  external: ['react', 'react-dom'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
})

const bundled = result.outputFiles[0].text
const header = `// 本文件由 scripts/build-client.mjs 从 src/client 生成，请勿直接修改。
window.__ModuleLoader__.load({
  id: ${JSON.stringify(packageJson.name)},
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    (function (module, exports, require) {
`
const footer = `
    })(module, exports, require);
    return module.exports;
  }
});
`
const output = header + bundled + footer

// ---- 产物契约校验：任一不满足直接失败，避免把坏包发出去后浏览器里静默不出现 ----
// V1：loader 包装。
if (!output.includes('window.__ModuleLoader__.load')) throw new Error('V1 失败：产物没有用 window.__ModuleLoader__.load 注册。')
// V2：模块 id 必须等于包名。
if (!output.includes(JSON.stringify(packageJson.name))) throw new Error(`V2 失败：产物缺少模块 id ${packageJson.name}。`)
// V3：必须包含看板注册标记。
for (const marker of REQUIRED_MARKERS) {
  if (!output.includes(marker)) throw new Error(`V3 失败：产物缺少注册标记 ${marker}（检查 src/client/index.jsx 的 apply）。`)
}
// V4：体积上限。
const bytes = Buffer.byteLength(output, 'utf8')
if (bytes > MAX_BUNDLE_BYTES) {
  throw new Error(`V4 失败：客户端单文件 ${bytes} 字节，超过 ${MAX_BUNDLE_BYTES} 字节上限（检查是否误打宿主依赖）。`)
}
// V5：external 纯净度。产物里出现的 require("x") 只允许 React 基线。
const required = [...output.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1])
const offending = [...new Set(required)].filter(specifier => !ALLOWED_EXTERNALS.has(specifier))
if (offending.length > 0) {
  throw new Error(`V5 失败：产物 require 了非基线模块 ${offending.join(', ')}（客户端不得值导入其它插件或宿主私有包）。`)
}

await mkdir(dirname(OUTPUT), { recursive: true })
await writeFile(OUTPUT, output, 'utf8')
console.log(`已生成 lib/client.js（${bytes} 字节）`)
