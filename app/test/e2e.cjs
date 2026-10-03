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
      try { mounted = await cdp.eval("document.querySelectorAll('.tabbar .navi').length === 3 && document.querySelectorAll('.block').length > 0") } catch (e) {}
      if (!mounted) await cdp.wait(300)
    }
    if (!mounted) throw new Error('应用没挂载起来（首屏没渲染出底栏与区块）')

    /* 底栏是 今日 | 收集 | 记账 三格。索引 0/1/2，各是一个真实页面。
       下面每一段都用这两个小工具。 */
    const clickTab = async (i) => { await cdp.eval(`(()=>{const e=document.querySelectorAll('.tabbar .navi')[${i}];if(e)e.click();return !!e})()`); await cdp.wait(350) }
    const shotCheck = async (file, want) => {
      await cdp.shot(file, SHOTS)
      const t = await cdp.eval("document.body.innerText.slice(0,500)")
      check('「' + want + '」渲染正常', t.replace(/\s/g, '').length > 20 ? 'true' : t, 'true')
    }
    /* 页面上有**多个** `.seg-b`（今日页四档、收集页两格、记账页两格）——
       v-show 让别的页面留在 DOM 里但 display:none，所以按可见性筛，
       取到的就是「当前这一页上的那颗」。 */
    const segTexts = `Array.from(document.querySelectorAll('.seg-b')).filter(x => x.offsetParent !== null).map(x => x.innerText.replace(/\\s+/g,' ').trim())`

    console.log('=== 端到端：今日页渲染 ===')
    await cdp.shot('1-today', SHOTS)

    /* ---- 底栏：三格、收集带未归类条数 ----
       「＋」和「复盘」2026-10-04 都挪走了（前者进收集页，后者进今日页第一排），
       所以现在只剩 今日 | 收集 N | 记账，三格对称。 */
    const nav = await cdp.eval(`(() => {
      return Array.from(document.querySelectorAll('.tabbar .navi'))
        .map(x => x.innerText.replace(/\\s+/g, ' ').trim())
        .join('|')
    })()`)
    check('底栏：今日|收集|记账（三格，加号已撤）', nav, '今日|收集 3|记账')

    /* ---- 今日页有多长 ----
       「待办/习惯/计划 铺在一起太长了」是这一轮改动的起因，
       所以把长度量出来钉住：**改之前是 2231px（约 2.8 屏）**。
       不硬断言「一屏装下」—— 待办一多这页照样会长，那是应该长的；
       但三块合并之后它不该再回到两屏以上。
       ⚠️ 量的是**可见那一页自己的高度**，不是 `document.body.scrollHeight`：
       后者在内容比视口矮时返回的是视口高度，会得到一个「刚好等于视口」的假数
       （1508 = 视口高，看着像一屏，其实什么都没量到）。 */
    const viewH = await cdp.eval("Math.round(window.innerHeight)")
    const todayH = await cdp.eval(`Math.round(Math.max.apply(null,
      Array.from(document.querySelectorAll('.page'))
        .filter(x => x.offsetParent !== null)
        .map(x => x.getBoundingClientRect().height)))`)
    check('今日页整页高 ' + todayH + 'px（改前 2231px，视口 ' + viewH + 'px）',
      todayH < viewH * 1.5 ? 'true' : String(todayH), 'true')

    /* ---- 今日页三档分段器 ----
       三块（待办/习惯/计划）原来一次铺出来，整页 2.8 屏；现在收在一颗分段器后面。
       数**必须**带：不带的话把习惯藏起来，就再也不知道今天还有没有习惯没打。 */
    const todayTabs = await cdp.eval(`(() => {
      return Array.from(document.querySelectorAll('.blk-seg .seg-b'))
        .filter(x => x.offsetParent !== null)
        .map(x => x.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')
    })()`)
    /* 查**形状**不查具体数字：那几个数跟着今天变（种子日期按天整体平移到今天）。 */
    check('三档各带一个数（待办 N·M | 习惯 N/M | 计划 N）',
      /^待办 \d+(·\d+)? \| 习惯 \d+(\/\d+)? \| 计划 \d+$/.test(todayTabs) ? 'true' : todayTabs, 'true')
    /* 分段器上那个逾期数必须**等于**列表里橙色的行数 ——
       两处各数一遍的话，「一个说 4、一个说 3」是最难发现的那种错。 */
    const latePair = await cdp.eval(`(() => {
      const cell = Array.from(document.querySelectorAll('.blk-seg .seg-b'))
        .filter(x => x.offsetParent !== null)[0]
      const m = cell.innerText.replace(/\\s+/g, '').match(/待办(\\d+)(?:·(\\d+))?/)
      return m ? ('seg-' + (m[2] || '0')) : 'no-match'
    })()`)
    const lateRows = await cdp.eval("document.querySelectorAll('.block .row-m.is-late').length")
    check('分段器上的逾期数 = 列表里橙色的行数', latePair, 'seg-' + lateRows)
    /* 默认停在「待办」档：另外两档的**内容**不该铺出来
       （那一档的名字在分段器上，所以查内容要用行里才有的字符串）。 */
    const onlyTodo = await cdp.eval(`(() => {
      const t = document.querySelector('.block').innerText
      return (t.indexOf('交上月报销单') >= 0 ? 'todo ' : '') +
             (t.indexOf('训练日打卡') >= 0 ? 'habit ' : '') +
             (t.indexOf('硬拉 100kg') >= 0 ? 'goal ' : '')
    })()`)
    check('默认只铺待办那一档', onlyTodo, 'todo ')

    const goTab = async (name) => {
      const ok = await cdp.eval(`(() => {
        const b = Array.from(document.querySelectorAll('.blk-seg .seg-b'))
          .filter(x => x.offsetParent !== null).find(x => x.innerText.indexOf('${name}') === 0)
        if (!b) return false; b.click(); return true
      })()`)
      await cdp.wait(320)
      return ok
    }

    check('切到「习惯」档', await goTab('习惯'), 'true')
    await cdp.shot('1b-today-habit', SHOTS)
    /* 这几条原来验的是「行字段接上了」。它们读的是**当前铺出来的那一块**，
       所以必须切到那一档再读 —— 三块合并之后，同时铺出来的只有一块。
       ⚠️ 「连续 N 周 · 累计 M 周」里那个 N/M 是**跟着今天变的**（种子日期按天整体
       平移到今天，而「连续」按周切），写死数字的断言大多数日子都是红的。
       这条断言要验的是「行字段接上了」，所以查形状不查数字。 */
    const habitTxt = await cdp.eval("document.querySelector('.block').innerText")
    check('习惯行带「连续 … 累计 …」（形状）', /连续 \d+ [天周个月]+ · 累计 \d+/.test(habitTxt) ? 'true' : habitTxt.slice(0, 200), 'true')
    check('习惯行有已完成态的圆钮（is-done）', await cdp.eval("document.querySelectorAll('.tickc.is-done').length > 0"), 'true')
    check('切到「计划」档', await goTab('计划'), 'true')
    await cdp.shot('1c-today-goal', SHOTS)
    check('计划行有进度', await cdp.eval("document.querySelector('.block').innerText"), '硬拉 100kg')
    check('切回「待办」档', await goTab('待办'), 'true')
    check('切回来待办又铺出来了', await cdp.eval("document.querySelector('.block').innerText.indexOf('交上月报销单')>=0"), 'true')

    /* 金额行整行可点 → **记一笔**（记账那一格的默认镜头）。
       「去记账」三个字删了，底栏已经有那一格。 */
    const toLedgerByLine = await cdp.eval("(()=>{const m=document.querySelector('.moneyline');if(!m)return false;m.click();return true})()")
    await cdp.wait(400)
    check('点金额行进记一笔', toLedgerByLine, 'true')
    check('确实到了记一笔（页头两格在，且停在第一格）', await cdp.eval(segTexts + ".join('|')"), '记一笔|记账')
    check('底栏那格也亮着（记账格底下两个镜头都算选中）',
      await cdp.eval("(()=>{const n=document.querySelectorAll('.tabbar .navi')[2];return n&&n.className.indexOf('is-on')>=0?'true':'false'})()"), 'true')
    await clickTab(0)

    console.log('')
    console.log('=== 端到端：走一遍缺陷路径（新增习惯时频率到底存成了什么）===')
    await goTab('习惯')
    const clicked = await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('.addbtn')).filter(x => x.offsetParent !== null).find(x => x.innerText.indexOf('新增习惯') >= 0);
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

    /* ---- 收集那一格：底下两个镜头（收集 / 随心记），顶部是「记东西」----
       2026-10-04 之前「记东西」是个弹层（底栏正中那颗加号），现在就在收集页顶部。 */
    await clickTab(1); await shotCheck('3-inbox', '收集')
    check('收集页头有两格镜头', await cdp.eval(segTexts + ".join('|')"), '收集|随心记')
    /* 「记东西」在收集镜头上（不在随心记镜头上）：
       默认模式是「只丢进收件箱」—— 那个胶囊应该高亮。 */
    check('收集页顶部有输入框和「记下」', await cdp.eval("document.querySelector('.capin') && document.querySelector('.cap-go') ? 'true' : 'false'"), 'true')
    check('默认模式是「只丢进收件箱」（那颗胶囊选中）',
      await cdp.eval("(()=>{const m=Array.from(document.querySelectorAll('.cap .mchip')).find(x=>x.innerText.trim()==='只丢进收件箱');return m&&m.className.indexOf('is-on')>=0?'true':'false'})()"), 'true')
    const toNotes = await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('.seg-b'))
        .filter(x => x.offsetParent !== null).find(x => x.innerText.trim() === '随心记');
      if (!b) return false; b.click(); return true;
    })()`)
    await cdp.wait(400)
    check('收集格里的「随心记」镜头进得去', toNotes, 'true')
    await shotCheck('4-notes', '随心记')
    check('「记东西」那一块**不在**随心记镜头上（它有自己的大框）',
      await cdp.eval("(()=>{const c=document.querySelector('.cap');return (c&&c.offsetParent!==null)?'还在':'没了'})()"), '没了')
    /* 再点底栏那一格要**回收集**（固定回默认镜头，和「点今日格回今日」一致）——
       不回的话，那一格会变成「上次看的那个」，和「今日」那格的行为就对不上了。 */
    await clickTab(1)
    check('再点「收集」格回到收集镜头', await cdp.eval("document.body.innerText.indexOf('收件箱') >= 0 ? 'true' : 'false'"), 'true')

    /* ---- 记东西那条链路：默认「只丢进收件箱」---- */
    const typedInbox = await cdp.eval(`(() => {
      const i = document.querySelector('.capin input');
      if (!i) return 'no-input';
      i.focus(); i.value = '端到端测试收件箱';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return i.value;
    })()`)
    check('收集页输入框能打字', typedInbox, '端到端测试收件箱')
    await cdp.eval("(()=>{const b=document.querySelector('.cap-go');if(b)b.click();return !!b})()")
    await cdp.wait(400)
    check('默认「只丢进收件箱」真的进了收件箱',
      await cdp.eval("document.body.innerText.indexOf('端到端测试收件箱') >= 0 ? 'true' : 'false'"), 'true')

    /* ---- 记账那一格：两个镜头（记一笔 / 记账）----
       宇定的默认是**记一笔**（记账最高频的动作），所以点底栏那格落在它上面。 */
    await clickTab(2)
    check('点「记账」格落在「记一笔」（默认镜头）',
      await cdp.eval("document.querySelector('.pay-page') && document.querySelector('.pay-page').offsetParent !== null ? 'pay' : 'other'"), 'pay')
    await shotCheck('7b-money-out', '记一笔')
    check('记一笔页头两格（记一笔 | 记账）', await cdp.eval(segTexts + ".join('|')"), '记一笔|记账')
    check('记一笔页上有方向两格，默认停在支出',
      await cdp.eval("(()=>{const t=Array.from(document.querySelectorAll('.dirseg .seg-b')).map(x=>x.innerText.trim());return t.length+':'+t.join('|')})()"), '2:支出|收入')
    check('金额起始是 ¥0', await cdp.eval("document.querySelector('.pay-page .amt-v').innerText"), '¥0')
    /* 这一页**有底栏**（它是个正常镜头，不是浮层）——
       和上一版（浮层盖住底栏）是刻意改的：那个两格切换器要一直在。
       ⚠️ 不能用 `offsetParent !== null` 判底栏可见：`position: fixed` 的元素
       `offsetParent` **恒为 null**（规范如此），会被误判成「看不见」。
       用盒子高度。 */
    check('记一笔是正常一页（底栏在，不是浮层）',
      await cdp.eval("(()=>{const w=document.querySelector('.paywrap');const t=document.querySelector('.tabbar');const vis=!!(t&&t.getBoundingClientRect().height>0);return (!w&&vis)?'true':'false'})()"), 'true')

    /* 切到「记账」格：**同一颗分段器、同一个位置**，切过去它不跳。 */
    check('切到「记账」格', await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('.seg-b'))
        .filter(x => x.offsetParent !== null).find(x => x.innerText.trim() === '记账');
      if (!b) return false; b.click(); return true;
    })()`), 'true')
    await cdp.wait(400)
    check('记账页头还是那两格', await cdp.eval(segTexts + ".join('|')"), '记一笔|记账')
    check('记账页的东西在（本月 / 最近流水）',
      await cdp.eval("document.body.innerText.indexOf('最近流水') >= 0 ? 'true' : 'false'"), 'true')
    await cdp.shot('7-ledger', SHOTS)

    /* 再切回「记一笔」——**方向要保持不动**（格内切换不重置方向）。
       重置的话，收/支来回看两遍就把人选的方向按回「支出」了。 */
    await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('.seg-b'))
        .filter(x => x.offsetParent !== null).find(x => x.innerText.trim() === '记一笔');
      if (b) b.click(); return !!b;
    })()`)
    await cdp.wait(400)
    check('切回「记一笔」',
      await cdp.eval("(()=>{const p=document.querySelector('.pay-page');return (p&&p.offsetParent!==null)?'true':'false'})()"), 'true')
    await cdp.shot('7e-ledger-to-pay', SHOTS)

    /* ---- 记一笔那一页走一遍完整链路 -----------------------------------------
       「点进去 → 挑分类 → 按键 → 完成 → 数落库」。
       光截图看不出「键按了但没记上」，所以每一步都走真实点击。 */
    check('方向两格是 支出|收入，默认停在支出',
      await cdp.eval("(()=>{const t=Array.from(document.querySelectorAll('.dirseg .seg-b')).map(x=>x.innerText.trim());return t.length+':'+t.join('|')})()"), '2:支出|收入')
    check('方向那颗是**窄的**（第二层，不和上面那颗镜头一样宽）',
      await cdp.eval(`(() => {
        const d = document.querySelector('.dirseg').getBoundingClientRect();
        const s = document.querySelector('.pay-page .seg').getBoundingClientRect();
        return (d.width < s.width - 100 ? 'true' : 'false') + ' 宽=' + Math.round(d.width) + '/' + Math.round(s.width);
      })()`), 'true')
    await cdp.shot('7b-money-out', SHOTS)

    /* ---- 真机尺寸下量一遍：键盘会不会被底栏挤出去 ----
       这一版把「记一笔」从浮层改成了正常页面，**底栏从此常驻**，
       于是多花掉 54px 高度 —— 键盘、金额卡、分类网格三样要一起挤进去。
       桌面视口 1508px 高，这一页永远「装得下」，在它上面量不出手机上会不会挤。
       换成 390×844（iPhone 14 那一档）再量。 */
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await cdp.wait(500)
    const mob = await cdp.eval(`(() => {
      const g = document.querySelector('.pay-page .grid').getBoundingClientRect();
      const a = document.querySelector('.pay-page .amt').getBoundingClientRect();
      const k = document.querySelector('.pay-page .keys').getBoundingClientRect();
      const t = document.querySelector('.tabbar').getBoundingClientRect();
      return JSON.stringify({
        grid: Math.round(g.height), amtTop: Math.round(a.top), keysBottom: Math.round(k.bottom),
        barTop: Math.round(t.top), vh: Math.round(window.innerHeight)
      });
    })()`)
    const mb = JSON.parse(mob)
    check('手机尺寸下键盘不被底栏压住（键底 ' + mb.keysBottom + ' / 栏顶 ' + mb.barTop + '）',
      mb.keysBottom <= mb.barTop + 1 ? 'true' : mob, 'true')
    check('手机尺寸下金额卡和键盘都在视口里（卡顶 ' + mb.amtTop + ' / 视口 ' + mb.vh + '）',
      mb.amtTop > 0 && mb.amtTop < mb.vh ? 'true' : mob, 'true')
    check('手机尺寸下分类网格还有可用高度（' + mb.grid + 'px）', mb.grid >= 120 ? 'true' : mob, 'true')
    await cdp.shot('7b2-pay-phone', SHOTS)
    await cdp.send('Emulation.clearDeviceMetricsOverride', {})
    await cdp.wait(300)

    /* 切到收入：**分类清单要换成另一套**（照截图，收入是理财/副业/工资），
       而且配色跟着变（支出红 / 收入绿）。 */
    await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('.dirseg .seg-b')).find(x => x.innerText.trim() === '收入');
      if (b) b.click(); return !!b;
    })()`)
    await cdp.wait(300)
    const inCats = await cdp.eval("Array.from(document.querySelectorAll('.cell:not(.cell-set) .cell-t')).map(x=>x.innerText).join(',')")
    check('切到收入后分类换成收入那一套', inCats, '工资')
    check('这一页方向类名切到 is-in', await cdp.eval("!!document.querySelector('.pay-page.is-in')"), 'true')
    await cdp.shot('7c-money-in', SHOTS)

    /* 挑第一个分类 → 按 1 2 3 → 完成。三步都走真实点击。 */
    await cdp.eval("(()=>{const c=document.querySelector('.cell:not(.cell-set)');if(c)c.click();return !!c})()")
    await cdp.wait(150)
    for (const d of ['1', '2', '3']) {
      await cdp.eval(`(() => {
        const k = Array.from(document.querySelectorAll('.k')).find(x => x.innerText.trim() === '${d}');
        if (k) k.click(); return !!k;
      })()`)
      await cdp.wait(80)
    }
    check('按键进了金额框', await cdp.eval("document.querySelector('.amt-v').innerText"), '¥123')
    const doneBtn = await cdp.eval(`(() => {
      const k = Array.from(document.querySelectorAll('.k')).find(x => x.innerText.trim() === '完成');
      if (!k) return false; k.click(); return true;
    })()`)
    await cdp.wait(500)
    check('点「完成」', doneBtn, 'true')
    /* 「完成」= 记下 + 去**记账页**（原来浮层那版是「关掉浮层」，
       现在没有「关掉」这回事了）。记账页的最近流水里正好能看到刚记的这一笔。
       ⚠️ 不能用「`.pay-page` 还在不在」判：视图是 v-show 切的，它**留在 DOM 里**
       只是 display:none。判「现在看得见哪一页」要看文本 —— innerText 不带隐藏的。 */
    check('记完落在记账页', await cdp.eval("document.body.innerText.indexOf('最近流水') >= 0 ? 'true' : 'false'"), 'true')
    const afterPay = await cdp.eval("document.body.innerText.replace(/\\s+/g,' ')")
    check('这一笔记进了流水（收入 +¥123）', afterPay.indexOf('+¥123') >= 0 ? 'true' : afterPay.slice(0, 300), 'true')
    await cdp.shot('7d-ledger-after-pay', SHOTS)

    /* ---- 空间（右上角那颗齿轮）+ 习惯提醒块 ----
       提醒那一块：H5 里没有原生壳，应该显示「只在 App 里生效」的实话，
       而不是一颗点了没反应的开关。 */
    await cdp.eval("(()=>{const g=document.querySelector('.gear');if(g)g.click();return !!g})()")
    await cdp.wait(350)
    await shotCheck('6-spaces', '空间')
    const remBlock = await cdp.eval(`(() => {
      const blocks = Array.from(document.querySelectorAll('.block'));
      const b = blocks.find(x => x.innerText.indexOf('习惯提醒') >= 0);
      return b ? b.innerText.replace(/\\s+/g, ' ').slice(0, 160) : 'NOT_FOUND';
    })()`)
    check('提醒块出现且说清「只在 App 里生效」', remBlock, '只在装到手机上')
    await cdp.shot('6b-remind-block', SHOTS)

    /* ---- 今日那一格的另外几个镜头（日历 / 四象限 / 复盘）----
       复盘 2026-10-04 从底栏挪进来了，成了这一排的第四格。 */
    await clickTab(0)
    for (const [file, label] of [['8-calendar', '日历'], ['9-quadrant', '四象限'], ['5-review', '复盘']]) {
      const ok = await cdp.eval(`(() => {
        const b = Array.from(document.querySelectorAll('.seg-b'))
          .filter(x => x.offsetParent !== null).find(x => x.innerText.trim() === '${label}');
        if (!b) return false; b.click(); return true;
      })()`)
      await cdp.wait(450)
      check('切到「' + label + '」', ok, 'true')
      await cdp.shot(file, SHOTS)
    }
    /* 停在「复盘」页时，页头那颗镜头分段器**必须还在** ——
       2026-10-04 宇点名：点复盘之后选择器不要消失。
       复盘页自己有一颗「本周/本月/自定义」，和这颗是两码事，
       所以用「有没有『今日』和『日历』那两格」来判断那颗镜头分段器在不在。 */
    check('复盘页上镜头分段器还在（能切回今日/日历/四象限）',
      await cdp.eval(`(() => {
        const b = Array.from(document.querySelectorAll('.seg-b'))
          .filter(x => x.offsetParent !== null).map(x => x.innerText.trim());
        return (b.indexOf('今日') >= 0 && b.indexOf('日历') >= 0 && b.indexOf('复盘') >= 0) ? 'true' : b.join('|');
      })()`), 'true')
    /* 切回「今日」，读页头那颗镜头分段器（不是块里那颗小号的）——
       它下面紧跟着 .moneyline 金额行，用它定位。 */
    await clickTab(0)
    await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('.seg-b'))
        .filter(x => x.offsetParent !== null).find(x => x.innerText.trim() === '今日');
      if (b) b.click(); return !!b;
    })()`)
    await cdp.wait(400)
    check('今日页头四个镜头都在',
      await cdp.eval("(()=>{const p=Array.from(document.querySelectorAll('.page')).find(x=>x.offsetParent!==null&&x.querySelector('.moneyline'));if(!p)return 'no-today-page';const s=p.querySelector('.seg');return s?Array.from(s.querySelectorAll('.seg-b')).filter(x=>x.offsetParent!==null).map(x=>x.innerText.trim()).join('|'):'no-seg'})()"),
      '今日|日历|四象限|复盘')
    await cdp.eval("(()=>{const g=document.querySelector('.gear');if(g)g.click();return !!g})()")
    await cdp.wait(350)
    await cdp.eval("(()=>{const c=document.querySelector('.card');if(c)c.click();return !!c})()")
    await cdp.wait(450)
    await cdp.shot('10-domain', SHOTS)
    const dom = await cdp.eval("document.body.innerText.slice(0,800)")
    check('领域页渲染正常且习惯行有连续/累计', dom.indexOf('连续') >= 0 ? 'true' : dom.slice(0, 200), 'true')

    /* ---- 最后的「打开应用先看」：**必须重载页面**才算真的验了冷启动 ----
       `applyHomePage()` 写在 main.js 里、紧跟在 `loadState()` 之后。
       光点一下设置里的胶囊只改了 db.HOME_PAGE，验不到「下次打开落在哪」——
       而那正是这一条的全部意义。 */
    check('设置里有「打开先看」三档',
      await cdp.eval("Array.from(document.querySelectorAll('.homechip')).map(x=>x.innerText.trim()).join('|')"),
      '上次停留|今日|记一笔')
    const pickHome = await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('.homechip')).find(x => x.innerText.trim() === '记一笔');
      if (!b) return false; b.click(); return true;
    })()`)
    check('选「记一笔」', pickHome, 'true')
    await cdp.wait(400)
    await cdp.send('Page.reload', {})
    await cdp.wait(1500)
    let up = false
    for (let i = 0; i < 40 && !up; i++) {
      try { up = await cdp.eval("document.querySelectorAll('.tabbar .navi').length === 3") } catch (e) {}
      if (!up) await cdp.wait(300)
    }
    const landed = await cdp.eval(
      "document.querySelector('.pay-page') ? 'pay' : " +
      "(document.body.innerText.indexOf('今天记下的') >= 0 ? 'today' : 'other')")
    check('重载之后落在「记一笔」（打开先看=记一笔）', landed, 'pay')
    /* 重载之后 `Page.reload` 会让 CDP 的执行上下文重建，紧跟的 captureScreenshot
       （尤其 `captureBeyondViewport: true`）会偶发超时。这张图不是断言，只是留档，
       所以包一层 try/catch：截不到不拖垮整轮，前面的 `landed` 断言才是它要验的。 */
    try { await cdp.wait(500); await cdp.shot('12-home-ledger', SHOTS) } catch (e) {}
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
