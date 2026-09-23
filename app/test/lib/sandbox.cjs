/* 测试沙箱：把 app/src 下的一个模块（连同它的相对依赖）拷到系统临时目录，
   补上 import 扩展名，并给裸包名造转发入口。

   为什么要拷：
   ① 源码里用的是无扩展名的 import（`from './seed'`），Node 的 ESM 解析器不做补全，
      直接 import 会 ERR_MODULE_NOT_FOUND；
   ② 拷到 app/ 之外之后，`import 'vue'` 这类裸包名解析不到 node_modules。

   **为什么拷到系统临时目录而不是仓库里**：不产生任何需要 gitignore 的东西，
   也不会在用户的 git status 里留下痕迹。跑完自动清掉。 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const APP = path.resolve(__dirname, '..', '..')          // app/
const SRC = path.join(APP, 'src')

const REL_IMPORT = /from\s+'(\.[^']*)'/g

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spine-test-'))

  /* 把 rel（相对 app/src）连它的相对依赖一起拷过来，返回入口的绝对路径。
     依赖被拍平到同一个目录里 —— 本项目的 store 是 db.js + seed.js 同目录，够用；
     以后出现跨目录的相对依赖，这里要改成保留目录结构。 */
  function copyGraph(rel) {
    const queue = [rel.replace(/\\/g, '/')]
    const seen = new Set()
    let entry = null
    while (queue.length) {
      const r = queue.shift()
      if (seen.has(r)) continue
      seen.add(r)
      let text = fs.readFileSync(path.join(SRC, r), 'utf8')
      const deps = []
      text = text.replace(REL_IMPORT, (m, p) => {
        if (/\.(mjs|cjs|js|json)$/.test(p)) return m
        deps.push(path.posix.normalize(path.posix.join(path.posix.dirname(r), p + '.js')))
        return "from '" + p + ".mjs'"
      })
      const out = path.join(dir, path.basename(r).replace(/\.js$/, '') + '.mjs')
      fs.writeFileSync(out, text)
      if (r === rel.replace(/\\/g, '/')) entry = out
      for (const d of deps) queue.push(d)
    }
    return entry
  }

  /* 给裸包名造一个转发入口，指向工程里真正的那份 */
  function link(name, targetAbsPath) {
    const d = path.join(dir, 'node_modules', name)
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({
      name, version: '0.0.0', type: 'module', main: 'index.mjs', exports: { '.': './index.mjs' }
    }, null, 2))
    fs.writeFileSync(path.join(d, 'index.mjs'),
      "export * from '" + require('url').pathToFileURL(targetAbsPath).href + "'\n")
    return d
  }

  /* 工程里的 vue 入口（app/node_modules/vue），转发用 */
  function linkVue() { return link('vue', path.join(APP, 'node_modules', 'vue', 'index.mjs')) }

  function cleanup() {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {}
  }

  return { dir, copyGraph, link, linkVue, cleanup }
}

module.exports = { makeSandbox, APP, SRC }
