/* TreeList 打卡交互的组件测试：把 TreeList.vue 真挂到 jsdom 里，
   真点打卡按钮，断言 ±1 / 长按撤销 / click 抑制 / 单次两态。
 *
 * 为什么需要它：长按撤销的「事件 → 逻辑」这条链，端到端里用无头浏览器
   模拟手势很不稳定（touch 合成 click 时灵时不灵），而组件层派发事件
   直达监听器，稳。真实手势（350ms 阈值、touchstart 管线）在真机上验证。
 *
 * 前置：jsdom（与 component.cjs 同一套解析，找不到就 SKIP）。
 */
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { makeSandbox, APP } = require('./lib/sandbox.cjs')
const frozenClock = require('./lib/frozen-clock.cjs')

function loadJsdom() {
  const tries = [
    () => require('jsdom'),
    () => require('module').createRequire(process.env.SPINE_JSDOM_DIR || APP + '/')(('jsdom')),
    () => require('module').createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')('jsdom')
  ]
  for (const t of tries) { try { return t() } catch (e) {} }
  return null
}

/* 编译一个 SFC（compileScript 内联模板），替换对 stores/db 的引用到沙箱根的 db.mjs */
function compile(compiler, src, id, rel) {
  const { descriptor, errors } = compiler.parse(fs.readFileSync(src, 'utf8'), { filename: src })
  if (errors && errors.length) throw new Error('SFC 解析失败（' + rel + '）：' + errors[0].message)
  let code = compiler.compileScript(descriptor, { id, inlineTemplate: true }).content
  return code
    .replace(/from\s+'(?:\.\.\/)+stores\/db'/g, "from './db.mjs'")
    .replace(/from\s+'(?:\.\.\/)+lib\/ui'/g, "from './ui.mjs'")
    .replace(/from\s+'(?:\.\.\/)+lib\/notify'/g, "from './notify.mjs'")
    .replace(/from\s+'\.\/TreeRow\.vue'/g, "from './TreeRow.mjs'")
    .replace(/from\s+'\.\/PlusIcon\.vue'/g, "from './PlusIcon.mjs'")
}

async function main() {
  const { JSDOM } = loadJsdom() || {}
  if (!JSDOM) {
    console.log('=== TreeList 打卡组件测试 ===')
    console.log('  SKIP：没找到 jsdom')
    return 0
  }

  frozenClock.install()
  /* 冻住的时钟对「长按后 700ms 内吞掉紧跟的 click」这个守卫不友好：
     时间不前进 → 同一行长按之后就再也点不动了（守卫永远算「刚长按过」）。
     这里给测试一块**可推进的表盘**：基准时刻不动（db 的 TODAY、自动 id
     仍然确定），只在需要「假装过了 700ms」时往前拨一格。 */
  let clockMs = Date.now()
  Date.now = () => clockMs
  const advance = ms => { clockMs += ms }
  const box = makeSandbox()
  let dom, app
  try {
    box.linkVue()
    box.copyGraph('stores/db.js')

    const compiler = require(path.join(APP, 'node_modules', '@vue', 'compiler-sfc'))
    const C = APP + '/src/components/'
    /* 依赖先编译：PlusIcon（无依赖）→ TreeRow（用 PlusIcon）→ TreeList（用 TreeRow/db/ui） */
    fs.writeFileSync(path.join(box.dir, 'PlusIcon.mjs'), compile(compiler, C + 'PlusIcon.vue', 'pi', 'PlusIcon.vue'))
    fs.writeFileSync(path.join(box.dir, 'TreeRow.mjs'), compile(compiler, C + 'TreeRow.vue', 'trow', 'TreeRow.vue'))
    fs.writeFileSync(path.join(box.dir, 'TreeList.mjs'), compile(compiler, C + 'TreeList.vue', 'tlist', 'TreeList.vue'))
    /* lib/ui.js → ui.mjs（它 import 的是 ../stores/db） */
    fs.writeFileSync(path.join(box.dir, 'ui.mjs'),
      fs.readFileSync(path.join(APP, 'src', 'lib', 'ui.js'), 'utf8')
        .replace(/from\s+'(?:\.\.\/)+stores\/db'/g, "from './db.mjs'"))
    /* lib/notify.js → notify.mjs：打卡会调 syncReminders，组件测试里没有原生桥，
       给一个空实现（sync 返回 supported:false 的 Promise），不碰真实 notify 逻辑 ——
       那一层由 e2e 和真机验证，不是这个组件的职责。 */
    fs.writeFileSync(path.join(box.dir, 'notify.mjs'),
      'export function syncReminders() { return Promise.resolve({ supported: false }) }\n'
      + 'export function notifySupported() { return false }\n'
      + 'export function enableReminders() { return Promise.resolve({ error: "no bridge" }) }\n'
      + 'export function disableReminders() { return Promise.resolve({ ok: true }) }\n')

    const toasts = []
    globalThis.uni = {
      getStorageSync() { return '' }, setStorageSync() {},
      showToast(o) { toasts.push(typeof o === 'string' ? o : (o && (o.title || o.msg)) || JSON.stringify(o)) },
      pageScrollTo() {},
      chooseFile() {}, getClipboardData() {}, setClipboardData() {}
    }
    dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { pretendToBeVisual: true })
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
    for (const k of ['Element', 'HTMLElement', 'SVGElement', 'MouseEvent', 'Node', 'Event']) globalThis[k] = dom.window[k]

    /* 打桩 addEventListener：记录每个事件的 type 和挂载目标（class/tag），定位 @click/@longpress 绑到哪 */
    const added = []
    const origAEL = dom.window.EventTarget.prototype.addEventListener
    dom.window.EventTarget.prototype.addEventListener = function (type, fn, opts) {
      added.push(type + ' @ ' + (this.className || this.tagName || String(this.tagName)))
      return origAEL.call(this, type, fn, opts)
    }

    const Vue = await import(pathToFileURL(path.join(box.dir, 'node_modules', 'vue', 'index.mjs')).href)
    const M = await import(pathToFileURL(path.join(box.dir, 'db.mjs')).href)
    const Comp = (await import(pathToFileURL(path.join(box.dir, 'TreeList.mjs')).href)).default

    M.loadSeed()
    /* rows 用 **computed** 挂载：bump 改 db 后 habitTree 重算 → 行对象更新 →
       按钮重渲染。传静态数组的话，数据在变、视图永远停在挂载那一刻。 */
    const rows = Vue.computed(() => M.habitTree().filter(r => ['h-fit-1', 'h-study-1'].includes(r.node.id)))
    const { createApp, h, nextTick } = Vue
    const host = document.getElementById('app')
    const vueErrors = []
    app = createApp({ setup() { return () => h(Comp, { rows: rows.value, tickable: true, onOpen: () => {} }) } })
    /* 组件事件 handler 里的抛错会被 Vue 捕获后打到 errorHandler —— 不挂这个，jsdom 里看不见 */
    app.config.errorHandler = (err, inst, info) => {
      vueErrors.push((err && err.message || String(err)) + ' @' + info)
    }
    app.mount(host)
    await nextTick()
    console.log('  [ael] ' + JSON.stringify(added.filter(t => t.indexOf('click') >= 0 || t.indexOf('longpress') >= 0)))

    /* rows 的顺序 = .trow 的 DOM 顺序 */
    const tickEl = i => host.querySelectorAll('.trow')[i].querySelector('.tickc')
    const label = i => tickEl(i).textContent.trim()
    const cls = i => tickEl(i).className
    const clickTick = i => tickEl(i).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    const longpress = i => tickEl(i).dispatchEvent(new dom.window.Event('longpress'))
    const todayLogs = id => M.db.HABIT_LOGS.filter(x => x.key === id && x.date === M.TODAY)

    /* Vue 的事件登记表。Vue 3.4 起键是 **Symbol("_vei")** 而不是字符串 `_vei` ——
       早先这里读 `el._vei` 恒为 undefined，看着像「事件没挂上去」，
       其实是读错了地方（查 Vue 3.4.21 的 runtime-dom：`const veiKey = Symbol("_vei")`）。
       要走符号才能拿到真表：{ onClick: fn, onLongpress: fn }。 */
    const vueEvents = el => Object.getOwnPropertySymbols(el)
      .filter(s => String(s).indexOf('vei') >= 0)
      .reduce((acc, s) => acc.concat(Object.keys(el[s] || {})), [])

    const results = []
    const assert = (name, cond, detail) => {
      results.push(cond)
      console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name)
      if (!cond) console.log('        ' + (detail || ''))
    }
    const ID_M = 'h-fit-1', ID_S = 'h-study-1'
    /* 多次型的数字是「本期次数 / 目标」—— 断言用**相对值**（±1），
       不写死种子数字（种子里本周打了几次是数据的事，不是按钮的事）。 */
    const num = s => parseInt(s, 10)
    const fmt = (n, s) => { const t = s.split('/')[1]; return n + '/' + t }

    /* ---- 多次型（每周 4 次）---- */
    assert('多次型挂载是进度环（不是勾）', cls(0).indexOf('is-ring') >= 0, cls(0))
    const b0 = label(0)
    clickTick(0); await nextTick()
    assert('点一下 → 本期 +1（' + b0 + ' → ' + label(0) + '）', label(0) === fmt(num(b0) + 1, b0), 'before ' + b0 + ' after ' + label(0))

    const b1 = label(0)
    /* 诊断：longpress 事件本身到不到元素（同步派发、同步断言），
       顺带把 Vue 登记的事件名列出来 —— 长按失效时一眼能看出是「没绑上」还是「绑上了没生效」。 */
    let lpReached = false
    tickEl(0).addEventListener('longpress', () => { lpReached = true })
    console.log('  [事件] Vue 登记=' + JSON.stringify(vueEvents(tickEl(0)))
      + ' 数据层今天次数=' + M.habitCountOn(ID_M)
      + '（若要撤销，这里必须 > 0）')
    longpress(0); await nextTick()
    assert('诊断：longpress 事件到达 .tickc', lpReached, 'lpReached=' + lpReached
      + ' Vue登记=' + JSON.stringify(vueEvents(tickEl(0))))
    assert('长按撤销 → 本期 −1', label(0) === fmt(num(b1) - 1, b1),
      'before ' + b1 + ' after ' + label(0) + ' 今天n=' + (todayLogs(ID_M)[0] || {}).n
      + ' vueErrors=' + JSON.stringify(vueErrors)
      + ' toasts=' + JSON.stringify(toasts) + ' countOn=' + M.habitCountOn(ID_M))
    assert('撤销后记录还在（n ≥ 1 或已删）', todayLogs(ID_M).length <= 1, '')

    const b2 = label(0)
    longpress(0); await nextTick()
    assert('再长按 → 再 −1（减到 0 记录删除）', label(0) === fmt(Math.max(0, num(b2) - 1), b2), 'before ' + b2 + ' after ' + label(0))

    /* 长按之后紧跟的那一次 click 必须被拦，否则「−1」随后又「+1」= 白按。
       先拨一下表盘让上一次长按的守卫过期，再点一下把记录补回来 ——
       这样长按是真的会 −1，一条断言同时验两件事：长按生效（−1）
       **且**它后面那一次 click 被吞（数字停在 −1 后的值，不回弹）。
       （原来这里直接接着长按，可那时今天已经 0 次、长按是空动作，
         期望值却写成「−1」—— 断言本身就错了。） */
    advance(1000)
    clickTick(0); await nextTick()
    const b3 = label(0)
    longpress(0); await nextTick()
    clickTick(0); await nextTick()          /* 表盘没再拨 → 这一下必须被吞 */
    assert('长按后紧跟的 click 被拦（数字不动）', label(0) === fmt(Math.max(0, num(b3) - 1), b3), 'before ' + b3 + ' after ' + label(0))

    /* ---- 单次型（每天）---- */
    assert('单次型挂载未打卡（is-idle）', cls(1).indexOf('is-idle') >= 0 && todayLogs(ID_S).length === 0, cls(1))

    clickTick(1); await nextTick()
    assert('单次打卡 → 已完成态 + 记录落库', cls(1).indexOf('is-done') >= 0 && todayLogs(ID_S).length === 1, cls(1))

    longpress(1); await nextTick()
    assert('单次长按撤销 → 记录删除', todayLogs(ID_S).length === 0, '')

    console.log('')
    console.log('  通过 ' + (results.filter(Boolean).length) + '/' + results.length)
    return results.every(Boolean) ? 0 : 1
  } finally {
    try { if (app) app.unmount() } catch (e) {}
    try { if (dom) dom.window.close() } catch (e) {}
    box.cleanup()
  }
}

main().then(c => process.exit(c)).catch(e => {
  console.log('组件测试出错：' + (e && e.stack || e))
  process.exit(2)
})
