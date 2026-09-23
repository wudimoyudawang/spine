/* 组件级交互测试：把 FreqField.vue 真挂到 jsdom 里、真点它，断言它有没有把
   change 事件发出去。
 *
 * 为什么需要它：编译产物对了不等于运行期对。
 * 这个组件曾经有过一个缺陷 —— 模板里写的是 `@click="unit = u"`（直接赋值），
 * 赋值确实生效、选中态也会高亮，但 `emit('change')` 整条链断掉，父组件拿不到新值。
 * 表现出来是「点了『每周』，保存下去还是『每天』」，而且再碰一下 ± 步进器又正常了。
 * 只看代码很难发现，编译产物能定性，真实点击能拍板。
 *
 * 前置：需要 jsdom（本项目没把它列为依赖，是为了不往 app 里加东西）。
 *   npm i -D jsdom        # 或者让它能找到本机某处已装的 jsdom
 * 找不到会打印 SKIP 并以 0 退出，不阻塞 npm test。
 */
const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')
const { pathToFileURL } = require('url')
const { makeSandbox, APP } = require('./lib/sandbox.cjs')
const frozenClock = require('./lib/frozen-clock.cjs')

/* ---- jsdom 解析：正常 require → 环境变量指定 → 本机托管 node 的隔离 workspace ---- */
function loadJsdom() {
  const tries = [
    () => require('jsdom'),
    () => createRequire(process.env.SPINE_JSDOM_DIR || APP + '/')(('jsdom')),
    () => createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')('jsdom')
  ]
  for (const t of tries) {
    try { return t() } catch (e) { /* 换下一个 */ }
  }
  return null
}

const CASES = [
  {
    name: '初始渲染：单位 = 每日 / 次数 = 1',
    run: async (c) => [c.activeUnit(), c.activeChip()]
  },
  {
    name: '点「每周」→ 必须发出 change（这条就是那个缺陷的主症状）',
    run: async (c) => { c.clickUnit('每周'); await c.tick(); return c.emitted() }
  },
  {
    name: '点常用档「3 次」→ 必须发出 change',
    run: async (c) => { c.clickChip('3 次'); await c.tick(); return c.emitted() }
  },
  {
    name: '点「每月」+ ＋ + − → 三次 change',
    run: async (c) => { c.clickUnit('每月'); await c.tick(); c.clickStep(1); await c.tick(); c.clickStep(-1); await c.tick(); return c.emitted() }
  },
  {
    name: '重复点已选中的单位 → 不发事件',
    run: async (c) => { c.clickUnit('每月'); await c.tick(); return c.emitted() }
  },
  {
    name: '步进器下边界：点「1 次」后按 − 不动',
    run: async (c) => { c.clickChip('1 次'); await c.tick(); const first = c.emitted(); c.clickStep(-1); await c.tick(); return [first, c.emitted()] }
  },
  {
    name: '传入不可解析的「工作日」→ 不发事件、显示回落默认位',
    run: async (c) => { c.setValue('工作日'); await c.tick(); return [c.emitted(), c.activeUnit(), c.activeChip()] }
  },
  {
    name: '传入「每周 5 次」→ 单位与次数正确解析',
    run: async (c) => { c.setValue('每周 5 次'); await c.tick(); return [c.emitted(), c.activeUnit(), c.activeChip()] }
  },
  {
    name: '传入「每月 12 次」→ 单位与次数正确解析',
    run: async (c) => { c.setValue('每月 12 次'); await c.tick(); return [c.emitted(), c.activeUnit(), c.stepText()] }
  },
  {
    name: '传入「每天 100 次」→ 到顶后 ＋ 不动',
    run: async (c) => { c.setValue('每天 100 次'); await c.tick(); const n = c.stepText(); c.clickStep(1); await c.tick(); return [c.activeUnit(), n, c.emitted()] }
  }
]

/* 期望值：这份测试的金标准。
   注意用例之间**是连着走的**（后面依赖前面留下的状态），所以期望值要按顺序读。
   两个坑写在这里备查：
   · props.value 变更走的是异步 watch，读 DOM 之前必须 await 一次 tick，
     否则会读到上一轮的值；
   · 次数只在前 10 个常用档（1/2/3/4/5/7/10/15/20/30）里才有「选中的胶囊」，
     12 次、100 次这种要读步进器上的数字（stepText()）而不是找 is-on 的胶囊。 */
const EXPECT = [
  ['每日', '1 次'],
  ['每周'],
  ['每周 3 次'],
  ['每月 3 次', '每月 4 次', '每月 3 次'],
  [],
  [['每月'], []],
  [[], '每日', '1 次'],
  [[], '每周', '5 次'],
  [[], '每月', '12 次'],
  ['每日', '100 次', []]
]

async function main() {
  const { JSDOM } = loadJsdom() || {}
  if (!JSDOM) {
    console.log('=== FreqField 组件交互测试 ===')
    console.log('  SKIP：没找到 jsdom。装上就能跑：npm i -D jsdom')
    console.log('  （本项目刻意没把它列为依赖；也可以用 SPINE_JSDOM_DIR 指向已装好的位置）')
    return 0
  }

  frozenClock.install()
  const box = makeSandbox()
  let dom, app
  try {
    box.linkVue()
    box.copyGraph('stores/db.js')

    /* 编译 SFC 并写进沙箱；把它对 stores/db 的引用改到同目录的 db.mjs */
    const sfcPath = path.join(APP, 'src', 'components', 'FreqField.vue')
    const { parse, compileScript } = require(path.join(APP, 'node_modules', '@vue', 'compiler-sfc'))
    const { descriptor, errors } = parse(fs.readFileSync(sfcPath, 'utf8'), { filename: sfcPath })
    if (errors && errors.length) throw new Error('SFC 解析失败：' + errors[0].message)
    let code = compileScript(descriptor, { id: 'freqlab', inlineTemplate: true }).content
    code = code.replace(/from\s+'(?:\.\.\/)+stores\/db'/g, "from './db.mjs'")
    const compPath = path.join(box.dir, 'FreqField.mjs')
    fs.writeFileSync(compPath, code)

    /* jsdom 全局必须在加载 vue 之前就位（runtime-dom 在模块作用域读 document） */
    globalThis.uni = {
      getStorageSync() { return '' }, setStorageSync() {},
      showToast() {}, pageScrollTo() {}, chooseFile() {}, getClipboardData() {}, setClipboardData() {}
    }
    dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { pretendToBeVisual: true })
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    /* Node 22 的 globalThis.navigator 是只读 getter，直接赋值会抛 */
    Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
    for (const k of ['Element', 'HTMLElement', 'SVGElement', 'MouseEvent', 'Node', 'Event']) globalThis[k] = dom.window[k]

    /* 让组件和测试用**同一个** vue 模块实例：都从沙箱里的转发入口拿 */
    const vueUrl = pathToFileURL(path.join(box.dir, 'node_modules', 'vue', 'index.mjs')).href
    const Vue = await import(vueUrl)
    const Comp = (await import(pathToFileURL(compPath).href)).default

    const { createApp, h, ref, nextTick } = Vue
    let value
    const emitted = []
    const host = document.getElementById('app')
    app = createApp({
      setup() {
        value = ref('每天')
        return () => h(Comp, { value: value.value, onChange: (e) => emitted.push(e) })
      }
    })
    app.mount(host)
    await nextTick()

    const q = (sel) => Array.from(host.querySelectorAll(sel))
    const text = (el) => (el ? el.textContent.trim() : null)
    let sliceFrom = 0
    const ctx = {
      activeUnit: () => text(q('.ucell').find(e => e.className.includes('is-on'))),
      activeChip: () => text(q('.mchip').find(e => e.className.includes('is-on'))),
      /* 步进器上的数字。次数不在常用档里时没有选中的胶囊，只能读这里 */
      stepText: () => text(q('.stepv')[0]),
      emitted: () => { const v = emitted.slice(sliceFrom); sliceFrom = emitted.length; return v },
      clickUnit(t) { const e = q('.ucell').find(x => text(x) === t); if (!e) throw new Error('找不到单位按钮：' + t); e.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) },
      clickChip(t) { const e = q('.mchip').find(x => text(x) === t); if (!e) throw new Error('找不到次数档：' + t); e.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) },
      clickStep(i) { const b = q('.stepb')[i === 1 ? 1 : 0]; b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) },
      setValue(v) { value.value = v },
      tick: () => nextTick()
    }

    console.log('=== FreqField 组件交互测试（jsdom 真实点击）===')
    let bad = 0
    for (let i = 0; i < CASES.length; i++) {
      const c = CASES[i]
      const got = await c.run(ctx)
      const want = EXPECT[i]
      const ok = JSON.stringify(got) === JSON.stringify(want)
      if (!ok) bad++
      console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + c.name)
      if (!ok) {
        console.log('        期望 ' + JSON.stringify(want))
        console.log('        实际 ' + JSON.stringify(got))
      }
      sliceFrom = emitted.length
    }
    console.log('')
    console.log('  通过 ' + (CASES.length - bad) + '/' + CASES.length)
    return bad ? 1 : 0
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
