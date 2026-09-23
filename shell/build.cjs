/* 把 app/ 的 H5 产物搬进原生壳。
 *
 * 为什么要有这一步：`app/` 是 uni-app 工程，`shell/` 是 Android 壳，
 * 两边不互相污染 —— 壳只认「一个放着 index.html 的目录」。
 * 所以这里做三件事：让 app 出一份 H5、清空 www 拷过去、把原生适配脚本拼进 index.html。
 *
 * 用法：
 *   node build.cjs              # 先构建 app，再搬
 *   node build.cjs --skip-build # 不构建 app，只搬（app 刚构建过的时候用）
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const APP = path.resolve(__dirname, '..', 'app')
const SRC = path.join(APP, 'dist', 'build', 'h5')
const WWW = path.join(__dirname, 'www')
const SHIM = path.join(__dirname, 'web-shim.js')

/* 找 npm。官方 Windows 安装包把它放在 node.exe 同级的 node_modules/npm 下，
   便携版/托管版也在这个位置，但不保证 —— 所以给几个候选，别写死一个。 */
const NPM = (function findNpm() {
  const dir = path.dirname(process.execPath)
  const cands = [
    path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(dir, 'npm.cmd'),
    process.env.npm_execpath,
  ].filter(Boolean)
  for (const c of cands) if (fs.existsSync(c)) return c
  return null
})()
const skipBuild = process.argv.indexOf('--skip-build') >= 0

function die(msg) { console.log('!! ' + msg); process.exit(1) }

/* npm.cmd 不能直接 spawn（新版 Node 禁止直接起 .bat/.cmd），要经 cmd.exe */
function npmArgs(args) {
  return /\.cmd$/i.test(NPM)
    ? { cmd: 'cmd.exe', args: ['/c', NPM].concat(args) }
    : { cmd: process.execPath, args: [NPM].concat(args) }
}

/* ---- 1. 构建 app 的 H5 产物 ---- */
if (skipBuild) {
  console.log('=== 1. 跳过 app 构建（--skip-build）===')
} else {
  console.log('=== 1. 构建 app 的 H5 产物 ===')
  if (!NPM) die('找不到 npm。装 Node 时一般会带，或者把 npm_cli 路径设到 NPM 环境变量里。')
  const c = npmArgs(['run', 'build:h5'])
  const r = spawnSync(c.cmd, c.args, {
    cwd: APP, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000
  })
  const out = ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/).filter(l => l.trim())
  if (r.error) die(String(r.error.message))
  /* 只打最后几行 —— 中间那一堆 Sass 弃用警告不用每次都看 */
  out.slice(-3).forEach(l => console.log('  ' + l.slice(0, 150)))
  if (r.status !== 0) { out.slice(-25).forEach(l => console.log('  ' + l.slice(0, 170))); die('构建失败 exit=' + r.status) }
}

if (!fs.existsSync(path.join(SRC, 'index.html'))) die('没有产物：' + SRC)

/* ---- 2. 清空 www 再拷 ---- */
console.log('')
console.log('=== 2. 搬进 www/ ===')
if (fs.existsSync(WWW)) fs.rmSync(WWW, { recursive: true, force: true })
fs.mkdirSync(WWW, { recursive: true })

let files = 0, bytes = 0
;(function copy(from, to) {
  for (const f of fs.readdirSync(from)) {
    const a = path.join(from, f), b = path.join(to, f)
    const st = fs.statSync(a)
    if (st.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copy(a, b) }
    else { fs.copyFileSync(a, b); files++; bytes += st.size }
  }
})(SRC, WWW)
console.log('  ' + files + ' 个文件，共 ' + (bytes / 1024).toFixed(0) + ' KB')

/* ---- 3. 把原生适配脚本拼进 index.html ---- */
console.log('')
console.log('=== 3. 注入原生适配脚本 ===')
const idx = path.join(WWW, 'index.html')
let html = fs.readFileSync(idx, 'utf8')
const shim = fs.readFileSync(SHIM, 'utf8')
const tag = '\n<script>' + shim + '</script>\n'
if (html.indexOf('</body>') >= 0) html = html.replace('</body>', tag + '</body>')
else html += tag
fs.writeFileSync(idx, html, 'utf8')
console.log('  web-shim.js 已拼进 index.html（' + shim.length + ' 字符）')
console.log('')

/* 自检：产物里该有什么、不该有什么 */
function has(text, needle) { return text.indexOf(needle) >= 0 }

/* 「App 专用提示」那句的探针串，**必须和 app/src/views/spaces.vue 里
   `// #ifndef H5` 那一段的实际文案逐字一致**。
   不一致会怎样：`!has(js, 探针)` 永远为真 —— 这条断言永远不失败，等于没有。
   （它原来就是这样：文案早改成「这个壳还没接存文件，先用剪贴板」了，
     探针还指着旧句子，于是一直在空转。）
   所以先确认探针本身在源码里还在，再拿它去查产物。 */
const APP_ONLY_HINT = '这个壳还没接存文件，先用剪贴板'
const SPACES = path.join(APP, 'src', 'views', 'spaces.vue')
const appSrc = fs.existsSync(SPACES) ? fs.readFileSync(SPACES, 'utf8') : ''
if (!has(appSrc, APP_ONLY_HINT)) {
  die('自检探针已失效：在 ' + SPACES + ' 里找不到\n     「' + APP_ONLY_HINT + '」\n'
    + '   那条提示语可能又改过文案 —— 请把 build.cjs 里的 APP_ONLY_HINT 同步成现在的写法。')
}

const js = (function all(d, o) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) all(p, o)
    else if (/\.js$/.test(f)) o.push(fs.readFileSync(p, 'utf8'))
  }
  return o
})(WWW, []).join('')
console.log('=== 自检 ===')
console.log('  探针串在源码里还有效                   : ' + has(appSrc, APP_ONLY_HINT))
console.log('  index.html 里有 SPINE_SAVE_FILE 定义 : ' + has(html, 'window.SPINE_SAVE_FILE ='))
console.log('  H5 产物理里没有那句 App 专用提示     : ' + !has(js, APP_ONLY_HINT))
console.log('  H5 产物理有浏览器那套导出            : ' + has(js, '这个浏览器存不了文件'))
console.log('')
console.log('www 准备好了。下一步：npx cap sync android')
