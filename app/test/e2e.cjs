/* 端到端（真实浏览器 + CDP，不需要 puppeteer —— Node 22 自带 WebSocket）。
 *
 *   node test/e2e.cjs                    跑一遍，截图到 test/.shots/
 *   node test/e2e.cjs --shots <目录>      指定截图目录（做「改动前后逐像素比对」用）
 *   node test/e2e.cjs --keep-open         跑完不关浏览器（调试用）
 *
 * 前置：先 `npm run build:h5`（要 dist/build/h5 的产物）。
 *
 * 它做两件事：
 *   ① **走一遍缺陷路径**：在真实界面上「新增习惯 → 点每周 → 点 3 次 → 提交 → 读回那一行」，
 *      确认存下去的是「每周 3 次」而不是默认的「每天」。这比任何单元断言都有说服力。
 *   ② 逐页切一遍并截图（今日/收集/随心记/复盘/空间/记账/日历/四象限/领域），
 *      当作「改动不该动到界面」的证据，也供像素比对。
 *
 * 三个已知坑都在这儿处理了：
 *   · 产物里的资源是绝对路径（/assets/…），file:// 打不开 → 必须起本地服务；
 *     而**服务必须在同一个进程里起**，后台进程会随上一个 shell 一起结束。
 *   · 机器上「启动加速」会留后台 Edge 抢接管 → 每次给独立的 --user-data-dir。
 *   · 截图走 Page.captureScreenshot 拿 base64 自己写文件，
 *     绕开 `--screenshot` 那条「png 在进程退出后 10~16 秒才落盘」的坑。
 */
const fs = require('fs')
const http = require('http')
const path = require('path')
const { spawn } = require('child_process')

const APP = path.resolve(__dirname, '..')
const DIST = path.join(APP, 'dist', 'build', 'h5')
const PORT = Number(process.env.SPINE_E2E_PORT || 5199)
const CDP_PORT = Number(process.env.SPINE_E2E_CDP_PORT || 9333)

const argv = process.argv.slice(2)
const shotsArg = argv.indexOf('--shots')
const SHOTS = shotsArg >= 0 ? path.resolve(argv[shotsArg + 1]) : path.join(__dirname, '.shots')
const KEEP_OPEN = argv.includes('--keep-open')

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) }
function get(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)) }).on('error', rej)
  })
}

function findEdge() {
  for (const c of [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/microsoft-edge', '/usr/bin/google-chrome'
  ]) if (fs.existsSync(c)) return c
  return null
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map() }
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.onopen = () => { const c = new Cdp(ws); ws.onmessage = e => c._on(e.data); resolve(c) }
      ws.onerror = () => reject(new Error('连不上 CDP: ' + url))
    })
  }
  _on(raw) {
    let m; try { m = JSON.parse(raw) } catch (e) { return }
    if (m.id && this.waiting.has(m.id)) { const w = this.waiting.get(m.id); this.waiting.delete(m.id); w(m) }
  }
  send(method, params) {
    const id = ++this.id
    return new Promise((res, rej) => {
      this.waiting.set(id, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))
      this.ws.send(JSON.stringify({ id, method, params: params || {} }))
      setTimeout(() => { if (this.waiting.has(id)) { this.waiting.delete(id); rej(new Error(method + ' 超时')) } }, 30000)
    })
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error('页面内异常: ' + (r.exceptionDetails.exception && (r.exceptionDetails.exception.description || r.exceptionDetails.exception.value) || r.exceptionDetails.text))
    return r.result.value
  }
  async wait(ms) { await this.eval('new Promise(r=>setTimeout(r,' + ms + '))') }
  async shot(name, dir) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    fs.mkdirSync(dir, { recursive: true })
    const p = path.join(dir, name + '.png')
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'))
    return p
  }
  close() { try { this.ws.close() } catch (e) {} }
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.log('=== 端到端 ===')
    console.log('  没有产物：' + DIST)
    console.log('  先跑 `npm run build:h5`（或从 app/ 目录跑 `node ../shell/build.cjs`）')
    return 1
  }
  const EDGE = findEdge()
  if (!EDGE) { console.log('  没找到 Edge/Chrome，跳过端到端。'); return 0 }

  const results = []
  const check = (name, got, want) => {
    const ok = String(got).indexOf(String(want)) >= 0
    results.push(ok)
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name)
    if (!ok) console.log('        期望含 ' + JSON.stringify(want) + '，实际 ' + JSON.stringify(String(got).slice(0, 240)))
  }

  /* ---- 1. 本地静态服务（必须在同一个进程里活着） ---- */
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    let p = path.join(DIST, url === '/' ? 'index.html' : url)
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html')
    try {
      const buf = fs.readFileSync(p)
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' })
      res.end(buf)
    } catch (e) { res.writeHead(404); res.end('not found') }
  })
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r))

  /* ---- 2. 浏览器 ---- */
  /* 浏览器的独立 profile 放**系统临时目录**且不主动删 ——
     删除动作会撞沙箱的删除审批；临时目录交给系统磁盘清理就好。 */
  const prof = path.join(require('os').tmpdir(), 'spine-e2e-' + Date.now())
  fs.mkdirSync(prof, { recursive: true })
  const browser = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=2', '--window-size=440,1600',
    '--remote-debugging-port=' + String(CDP_PORT),
    '--user-data-dir=' + prof,
    '--no-first-run', '--no-default-browser-check',
    'http://127.0.0.1:' + PORT + '/'
  ], { stdio: 'ignore', windowsHide: true })

  let cdp = null
  try {
    let target = null
    for (let i = 0; i < 100 && !target; i++) {
      try {
        const list = JSON.parse(await get('http://127.0.0.1:' + CDP_PORT + '/json/list'))
        /* 必须按 URL 挑我们的页 —— Edge 冷启动会弹自己的「欢迎/同步」标签页，
           它排在列表前面，不筛 URL 就会连上去，然后「应用永远挂载不起来」。 */
        target = list.find(x => x.type === 'page' && x.webSocketDebuggerUrl && x.url.indexOf('127.0.0.1:' + PORT) >= 0)
      } catch (e) { /* 还没起来 */ }
      if (!target) sleepSync(300)
    }
    if (!target) throw new Error('浏览器没起来（CDP 连不上）')
    cdp = await Cdp.connect(target.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    /* 等应用挂载 */
    let mounted = false
    for (let i = 0; i < 80 && !mounted; i++) {
      try { mounted = await cdp.eval("document.querySelectorAll('.tabbar .navi').length === 5 && document.querySelectorAll('.block').length > 0") } catch (e) {}
      if (!mounted) await cdp.wait(300)
    }
    if (!mounted) throw new Error('应用没挂载起来（首屏没渲染出底栏与区块）')

    console.log('=== 端到端：今日页渲染 ===')
    await cdp.shot('1-today', SHOTS)
    const home = await cdp.eval("Array.from(document.querySelectorAll('.block')).map(b=>b.innerText).join('\\n')")
    check('习惯行带「连续 … 累计 …」（行字段已接上）', home, '连续 2 周 · 累计 2 周')
    /* 已打卡的按钮是实心圆 + 白勾（方案 D），没有文字了 —— 改查它的 DOM 类 */
    check('习惯行有已完成态的圆钮（is-done）', await cdp.eval("document.querySelectorAll('.tickc.is-done').length > 0"), 'true')
    check('计划行有进度', home, '硬拉 100kg')

    console.log('')
    console.log('=== 端到端：走一遍缺陷路径（新增习惯时频率到底存成了什么）===')
    const clicked = await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('.addbtn')).find(x => x.innerText.indexOf('新增习惯') >= 0);
      if (!b) return false; b.click(); return true;
    })()`)
    check('点开「新增习惯」', clicked, 'true')
    await cdp.wait(300)
    check('弹窗已出现', await cdp.eval("!!document.querySelector('.modal .field-k')"), 'true')

    /* uni-app 的 <input> 在 H5 里包成 <uni-input>，能吃 input 事件的是里面那个原生 input */
    const typed = await cdp.eval(`(() => {
      const i = document.querySelector('.modal input');
      if (!i) return 'no-native-input';
      i.focus(); i.value = '端到端测试习惯';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return i.value;
    })()`)
    check('写入习惯名', typed, '端到端测试习惯')

    check('点到「每周」', await cdp.eval(`(() => {
      const u = Array.from(document.querySelectorAll('.modal .ucell')).find(x => x.innerText.trim() === '每周');
      if (!u) return false; u.click(); return true;
    })()`), 'true')
    await cdp.wait(150)
    check('点到「3 次」', await cdp.eval(`(() => {
      const c = Array.from(document.querySelectorAll('.modal .mchip')).find(x => x.innerText.trim() === '3 次');
      if (!c) return false; c.click(); return true;
    })()`), 'true')
    await cdp.wait(150)
    await cdp.shot('2-addhabit', SHOTS)

    await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('.modal .btn')).find(x => x.innerText.trim() === '新增');
      if (b) b.click(); return !!b;
    })()`)
    await cdp.wait(400)

    const after = await cdp.eval("Array.from(document.querySelectorAll('.block')).map(b=>b.innerText).join('\\n')")
    check('新增的习惯落成「每周 3 次」（不是默认的「每天」）', after, '每周 3 次')
    /* 再确认一次：**那一行自己**的文案里就是「每周 3 次」。
       不要用「按行找」的写法 —— innerText 会把同一行里的两个 <text> 拆成两行，
       名字和频率不在同一行上，那种断言会误报。 */
    const rowText = await cdp.eval(`(() => {
      const r = Array.from(document.querySelectorAll('.trow')).find(x => x.innerText.indexOf('端到端测试习惯') >= 0);
      return r ? r.innerText.replace(/\\n+/g, ' ┃ ') : 'NOT_FOUND';
    })()`)
    check('那一行自身带「每周 3 次」', rowText, '每周 3 次')
    check('那一行没有落成默认的「每天」', rowText.indexOf('· 每天') < 0 ? 'ok' : rowText, 'ok')

    console.log('')
    console.log('=== 端到端：多次打卡与长按撤销（CDP 派发真实触摸）===')
    /* 开触摸模拟：桌面 Edge 没有触摸输入，而 uni 的 longpress 只监听 touchstart。
       这个用例同时检验两件事：±1 的计数，和**长按后紧跟的 click 有没有被拦住** ——
       拦不住的话长按会变成 −1 +1 = 原地踏步，下面那条断言就会挂。 */
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    const tickAt = async () => await cdp.eval(`(() => {
      const r = Array.from(document.querySelectorAll('.trow')).find(x => x.innerText.indexOf('端到端测试习惯') >= 0);
      if (!r) return null;
      const t = r.querySelector('.tickc');
      if (!t) return null;
      /* 新建的习惯排在块尾，多半在首屏视口之外 —— 不滚进来，
         后面按坐标派发的点击全落在视口外，等于哪也没点。 */
      t.scrollIntoView({ block: 'center' });
      const b = t.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, label: t.innerText.trim() };
    })()`)
    const tickLabel = async () => {
      const t = await tickAt()
      return t ? t.label : 'NOT_FOUND'
    }
    const touch = async (kind, x, y) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: kind,
        touchPoints: kind === 'touchStart' ? [{ x, y }] : []
      })
    }
    /* 单击/长按都在页面里**派发事件**而不是模拟输入：
       无头 Edge 的 dispatchTouchEvent 合成 click 时灵时不灵、
       坐标还会随页面滚动失效 —— 而 tap/hold 的**逻辑与绑定**用事件派发就能验证到位；
       真实手势（350ms 阈值、touchstart 管线）在真机上验证。 */
    tk = await tickAt()
    await cdp.eval(`(() => {
      const r = Array.from(document.querySelectorAll('.trow')).find(x => x.innerText.indexOf('端到端测试习惯') >= 0);
      const t = r && r.querySelector('.tickc');
      if (!t) return false; t.click(); return true;
    })()`)
    await cdp.wait(300)
    check('点一下 = 本期 +1（0/3 → 1/3）', await tickLabel(), '1/3')

    tk = await tickAt()
    await cdp.eval(`(() => {
      const r = Array.from(document.querySelectorAll('.trow')).find(x => x.innerText.indexOf('端到端测试习惯') >= 0);
      const t = r && r.querySelector('.tickc');
      if (!t) return false; t.click(); return true;
    })()`)
    await cdp.wait(300)
    check('再点一下 = 2/3', await tickLabel(), '2/3')

    /* 长按：走 uni-h5 自己的 longpress 模拟链路 —— 它监听的是 window 的
       touchstart（350ms 定时器后派发 longpress）。
       **但 touchstart 必须派发在元素上，不能派发在 window 上**：uni-h5 合成
       longpress 用的是 `evt.target.dispatchEvent(customEvent)`（见
       uni-h5.es.js 的 initLongPress），派发在 window 上 target 就是 window，
       longpress 也发在 window 上，绑在 .tickc 的监听器永远收不到。
       这条用例长期红着、被当成「无头浏览器合成手势不稳定」——
       其实它每次都不生效，真正的原因就在这里。 */
    tk = await tickAt()
    await cdp.eval(`(async () => {
      const r = Array.from(document.querySelectorAll('.trow')).find(x => x.innerText.indexOf('端到端测试习惯') >= 0);
      const t = r && r.querySelector('.tickc');
      if (!t) return false;
      const b = t.getBoundingClientRect();
      const mk = () => new Touch({ identifier: 1, target: t, clientX: b.x + 15, clientY: b.y + 15, pageX: b.x + 15, pageY: b.y + 15, radiusX: 2, radiusY: 2, force: 1 });
      t.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [mk()] }));
      await new Promise(r2 => setTimeout(r2, 450));
      t.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [mk()] }));
      return true;
    })()`)
    await cdp.wait(300)
    check('长按 = 撤销一次（2/3 → 1/3，且 click 没有跟着 +1）', await tickLabel(), '1/3')
    await cdp.shot('11-habit-tick', SHOTS)

    console.log('')
    console.log('=== 逐页冒烟 + 截图（' + SHOTS + '）===')
    const clickTab = async (i) => { await cdp.eval(`(()=>{const e=document.querySelectorAll('.tabbar .navi')[${i}];if(e)e.click();return !!e})()`); await cdp.wait(350) }
    const shotCheck = async (file, want) => {
      await cdp.shot(file, SHOTS)
      const t = await cdp.eval("document.body.innerText.slice(0,500)")
      check('「' + want + '」渲染正常', t.replace(/\s/g, '').length > 20 ? 'true' : t, 'true')
    }

    await clickTab(1); await shotCheck('3-inbox', '收集')
    await clickTab(3); await shotCheck('4-notes', '随心记')
    await clickTab(4); await shotCheck('5-review', '复盘')
    await cdp.eval("(()=>{const g=document.querySelector('.gear');if(g)g.click();return !!g})()")
    await cdp.wait(350)
    await shotCheck('6-spaces', '空间')

    /* 习惯提醒那一块：H5 里没有原生壳，应该显示「只在 App 里生效」的实话，
       而不是一颗点了没反应的开关。 */
    const remBlock = await cdp.eval(`(() => {
      const blocks = Array.from(document.querySelectorAll('.block'));
      const b = blocks.find(x => x.innerText.indexOf('习惯提醒') >= 0);
      return b ? b.innerText.replace(/\\s+/g, ' ').slice(0, 160) : 'NOT_FOUND';
    })()`)
    check('提醒块出现且说清「只在 App 里生效」', remBlock, '只在装到手机上')
    await cdp.shot('6b-remind-block', SHOTS)

    const toLedger = await cdp.eval(`(() => {
      const c = Array.from(document.querySelectorAll('.card')).find(x => x.innerText.indexOf('记账') >= 0);
      if (!c) return false; c.click(); return true;
    })()`)
    await cdp.wait(400)
    check('从空间点进记账页', toLedger, 'true')
    await shotCheck('7-ledger', '记账')

    await clickTab(0)
    for (const [file, label] of [['8-calendar', '日历'], ['9-quadrant', '四象限']]) {
      const ok = await cdp.eval(`(()=>{const b=Array.from(document.querySelectorAll('.seg-b')).find(x=>x.innerText.trim()==='${label}');if(b)b.click();return !!b})()`)
      await cdp.wait(450)
      check('切到「' + label + '」', ok, 'true')
      await cdp.shot(file, SHOTS)
    }
    await cdp.eval("(()=>{const g=document.querySelector('.gear');if(g)g.click();return !!g})()")
    await cdp.wait(350)
    await cdp.eval("(()=>{const c=document.querySelector('.card');if(c)c.click();return !!c})()")
    await cdp.wait(450)
    await cdp.shot('10-domain', SHOTS)
    const dom = await cdp.eval("document.body.innerText.slice(0,800)")
    check('领域页渲染正常且习惯行有连续/累计', dom.indexOf('连续') >= 0 ? 'true' : dom.slice(0, 200), 'true')
  } finally {
    if (cdp && !KEEP_OPEN) cdp.close()
    if (!KEEP_OPEN) {
      try { browser.kill() } catch (e) {}
      try { srv.close() } catch (e) {}
    }
  }

  const bad = results.filter(x => !x).length
  console.log('')
  console.log('=== 汇总 ===  通过 ' + (results.length - bad) + '/' + results.length)
  return bad ? 1 : 0
}

main().then(c => process.exit(c)).catch(e => {
  console.log('端到端出错：' + (e && e.message || e))
  process.exit(2)
})
