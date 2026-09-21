/* ================= 数据层 =================
 *
 * 这里是「这个应用的全部可变状态」+ 读写它的函数。
 * 变量名故意和原型 prototype/index.html 保持一致（ITEMS / LOGS / DOMAINS …），
 * 只是从全局 var 收进了一个 reactive 对象 —— 对照着看时少一层映射，
 * 迁移期最怕的就是「这个名字在这边是那个意思」。
 *
 * 两层数据要分清（原型里的 DATA_VARS / SCALAR_VARS 就是这个分法）：
 *   · 真正数据 —— 进快照、进导出文件、将来要同步的就是它们
 *   · 界面状态 —— 停在哪一页、选了哪个速记模式；只活在这台设备上，不导出去
 *      （在手机上导出的档案，导进另一台机器后「停在哪一页」跟着跑过去，只会让人莫名其妙）
 */
import { reactive, ref } from 'vue'
import { SEED_DATA, SEED_UI } from './seed'

/* ---------------- 日期 ---------------- */
const WEEK = ['日', '一', '二', '三', '四', '五', '六']

export function pad2(n) { return (n < 10 ? '0' : '') + n }
export function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) }
export function shiftDays(iso, n) {
  const p = String(iso).split('-').map(Number)
  const t = new Date(p[0], p[1] - 1, p[2])
  t.setDate(t.getDate() + n)
  return isoOf(t)
}
export function dayCount(from, to) {
  const a = String(from).split('-').map(Number), b = String(to).split('-').map(Number)
  return Math.round((new Date(b[0], b[1] - 1, b[2]) - new Date(a[0], a[1] - 1, a[2])) / 86400000)
}
export function weekdayCN(iso) {
  const p = String(iso).split('-').map(Number)
  return WEEK[new Date(p[0], p[1] - 1, p[2]).getDay()]
}
/* 界面上到处在用的中文日期：'9月17日 周四'。原型里叫 fmtCN，名字保持不变 */
export function fmtCN(iso) {
  const p = String(iso).split('-').map(Number)
  return p[1] + '月' + p[2] + '日 周' + weekdayCN(iso)
}
/* 一期从哪天算起。一周以**周一**为头（周日算上一周的末尾）——
   以周日开头的话，「本周」在最常看的那两天里会显得短一截。 */
export function startOfWeek(iso) {
  const p = String(iso).split('-').map(Number)
  const w = new Date(p[0], p[1] - 1, p[2]).getDay()
  return shiftDays(iso, -(w === 0 ? 6 : w - 1))
}
export function startOfMonth(iso) { return String(iso).slice(0, 7) + '-01' }

/* 今天。原型里 TODAY 是写死的 '2026-09-18'（演示用），真机上必须是真日子。 */
export const TODAY = isoOf(new Date())

/* 种子数据的日期全是围着原型那一天配的。
   第一次打开时整体平移到真实今天 —— 不平移的话，新装上的人一进来
   看到的全是过期两周的待办，那不像一个能用的工具，像一个坏掉的演示。 */
const SEED_ANCHOR = '2026-09-18'
const SHIFT = dayCount(SEED_ANCHOR, TODAY)

/* RECORD_TYPES 里的日期是展示用的中文（'9月18日' / '9月16日 周三'），不是可计算字段，
   所以单独处理：解析出来平移，再按原格式写回去。带星期后缀的要把星期重算，
   否则平移完就成了「9月16日 周三」—— 日子对了，星期还是旧的。 */
function shiftCN(s) {
  const m = /^(\d+)月(\d+)日(\s*周.)?$/.exec(String(s))
  if (!m) return s
  const iso = shiftDays(SEED_ANCHOR.slice(0, 4) + '-' + pad2(Number(m[1])) + '-' + pad2(Number(m[2])), SHIFT)
  const p = iso.split('-').map(Number)
  return p[1] + '月' + p[2] + '日' + (m[3] ? ' 周' + weekdayCN(iso) : '')
}

function deepCopy(o) { return JSON.parse(JSON.stringify(o)) }

/* ---------------- 状态 ---------------- */
export const db = reactive({
  ITEMS: [], HABIT_LOGS: [], INBOX: [], NOTES: [], NOTE_PROMPTS: [],
  LOGS: [], DOMAINS: [], RECORD_TYPES: [], CAPTURE_MODES: [],
  AUTO_RULES: [], TODAY_LOGS: [], CAT_WORDS: {}, CATS: [],
  /* 界面状态 */
  CURRENT: 'today',
  DOMAIN_ID: '',
  CAPTURE_MODE: 'auto',
  CAPTURE_CAT: '',
  CLOSED_NODES: {},
  /* 提交完面板自己收不收。默认收（宇定的）——
     连着记几笔的时候，把面板右上角那个开关打开就不必每次重新点加号。
     它同时是设置页里的一条，两处改的是同一个值。 */
  CAP_AUTO_CLOSE: true,
  /* 面板开着没有、现在是哪个模式。
     瞬时状态，**不进 UI_KEYS** —— 重开 App 时不该一进来就弹着个面板。
     放在 db 里而不是组件内部，是因为底栏和面板是两个组件，
     挂在任意一边另一边都得转发事件。 */
  CAP_OPEN: false,
  CAPTURE_KIND: 'quick',
  /* 「记一笔」那排胶囊：哪些进这一排、按什么顺序。
     存成一张**独立的偏好表**，不去动 CAPTURE_MODES / RECORD_TYPES 本身 ——
     那两个是「有什么可记」（数据），这张是「你想怎么摆」（偏好）。
     混在一起的话，想恢复默认就得先把数据也还原一遍，容易误伤。

     common 里**只存手动改过的**那些，没登记的按默认（内置类目都进，记录项看 quick）。
     这样以后新增领域或记录项，它自己就会按默认规则出现在列表里，不用手动登记。 */
  CAP_CFG: { order: [], common: {} }
})

/* 进快照、进导出文件的就是这 14 项。前 13 项和原型的 DATA_VARS 一字不差，
   末尾的 CAP_CFG 是 uni-app 版新增的（原型把这类配置放在设置页里改，没进快照）。
   增减任何一项都要想清楚：它该不该跟着导出文件走。 */
export const DATA_KEYS = ['ITEMS', 'HABIT_LOGS', 'INBOX', 'NOTES', 'NOTE_PROMPTS', 'LOGS',
  'DOMAINS', 'RECORD_TYPES', 'CAPTURE_MODES', 'AUTO_RULES', 'TODAY_LOGS', 'CAT_WORDS', 'CATS',
  'CAP_CFG']

/* 界面状态：跟着设备走，不进导出文件 */
export const UI_KEYS = ['CURRENT', 'DOMAIN_ID', 'CAPTURE_MODE', 'CAP_AUTO_CLOSE']

export function loadSeed() {
  const d = deepCopy(SEED_DATA)
  d.ITEMS.forEach(x => { if (x.due) x.due = shiftDays(x.due, SHIFT) })
  d.HABIT_LOGS.forEach(x => { x.date = shiftDays(x.date, SHIFT) })
  d.INBOX.forEach(x => { if (x.at) x.at = shiftDays(x.at, SHIFT) })
  d.NOTES.forEach(x => { if (x.d) x.d = shiftDays(x.d, SHIFT) })
  d.LOGS.forEach(x => { x.date = shiftDays(x.date, SHIFT) })
  d.RECORD_TYPES.forEach(t => (t.logs || []).forEach(l => { l.d = shiftCN(l.d) }))
  DATA_KEYS.forEach(k => { db[k] = d[k] })
  db.CURRENT = 'today'
  db.DOMAIN_ID = ''
  db.CAPTURE_MODE = 'auto'
  db.CAPTURE_CAT = ''
  db.CLOSED_NODES = deepCopy(SEED_UI.CLOSED_NODES) || {}
  db.CAP_AUTO_CLOSE = true
  db.CAP_CFG = { order: [], common: {} }
}

/* ---------------- 快照 · 本机存储 ----------------
   localStorage 换成了 uni.setStorageSync：同一份代码在浏览器里落到 localStorage，
   在 App 里落到原生存储。接口只有 snapshot / restore 两个函数，
   将来换 SQLite 或接后端，也只改这一层。 */
const LS_KEY = 'spine.state.v1'

export function snapshot() {
  const s = { v: {}, s: {} }
  DATA_KEYS.forEach(k => { s.v[k] = db[k] })
  UI_KEYS.forEach(k => { s.s[k] = db[k] })
  return JSON.stringify(s)
}

export function restore(raw) {
  const s = JSON.parse(raw)
  if (s && s.v) DATA_KEYS.forEach(k => { if (s.v[k] !== undefined) db[k] = s.v[k] })
  if (s && s.s) UI_KEYS.forEach(k => { if (s.s[k] !== undefined) db[k] = s.s[k] })
}

let LAST_SAVED = ''
/* 存不下的时候要有人管。用户以为存住了、其实没存，是这个应用最不能出的一种错 ——
   所以这里不是一个 console.error 就算了，UI 会读这个标志把实情显示出来。 */
export const storeFailed = ref(false)

export function loadState() {
  let raw = ''
  try { raw = uni.getStorageSync(LS_KEY) || '' } catch (e) { storeFailed.value = true }
  let loaded = false
  if (raw) { try { restore(raw); loaded = true } catch (e) { loaded = false } }
  if (!loaded) loadSeed()
  LAST_SAVED = snapshot()
  return loaded
}

export function saveState(force) {
  const snap = snapshot()
  /* 没变化就不写。这个函数每 2 秒被叫一次，次次都写会把存储写爆 */
  if (!force && snap === LAST_SAVED) return
  try {
    uni.setStorageSync(LS_KEY, snap)
    LAST_SAVED = snap
    storeFailed.value = false
  } catch (e) {
    storeFailed.value = true
  }
}

/* ---------------- 查询 ---------------- */
export function domainById(id) { return db.DOMAINS.filter(d => d.id === id)[0] || null }
export function itemById(id) { return db.ITEMS.filter(i => i.id === id)[0] || null }
export function habitById(id) {
  for (const d of db.DOMAINS) {
    const h = (d.habits || []).filter(x => x.id === id)[0]
    if (h) return h
  }
  return null
}
export function goalById(id) {
  for (const d of db.DOMAINS) {
    const g = (d.goals || []).filter(x => x.id === id)[0]
    if (g) return g
  }
  return null
}
export function kidsOf(list, parent) {
  return (list || []).filter(x => (x.parent || null) === (parent || null))
}

/* 今日页要显示的待办。照抄原型 pickToday：
   只挑没做完、有日期的，分成「已过期」和「今天到期」两组，过期那组按日期从早到晚。 */
export function pickToday(items, today) {
  const t = today || TODAY, over = [], due = []
  for (const it of (items || [])) {
    if (it.status === 'done' || !it.due) continue
    if (it.due < t) over.push(it)
    else if (it.due === t) due.push(it)
  }
  over.sort((a, b) => (a.due < b.due ? -1 : (a.due > b.due ? 1 : 0)))
  return { overdue: over, due: due }
}

/* ---------------- 打卡 ---------------- */
export function habitDates(id) {
  const out = []
  for (const h of db.HABIT_LOGS) {
    if (h.key === id && out.indexOf(h.date) < 0) out.push(h.date)
  }
  return out.sort()
}
export function habitDoneOn(id, date) {
  return db.HABIT_LOGS.some(h => h.key === id && h.date === date)
}
export function habitTotalDays(id) { return habitDates(id).length }
/* 某一个区间里打过几天卡。复盘那张表要的就是这个数 ——
   它和「累计」不是一回事：累计是全时段，这个只看这一期。 */
export function habitDaysInRange(id, from, to) {
  return habitDates(id).filter(function (d) { return d >= from && d <= to }).length
}

/* 连续打卡天数：从今天往回数，遇到第一个没打卡的日子就停。
   今天还没打卡**不算断** —— 这一天还没过完，早上打开一眼就被判「断了」太伤人。
   所以：今天有卡就从今天起数，今天没有就从昨天起数。 */
export function habitStreakDays(id, today) {
  const has = {}, dts = habitDates(id)
  dts.forEach(d => { has[d] = 1 })
  let day = today || TODAY
  if (!has[day]) day = shiftDays(day, -1)
  let n = 0
  while (has[day] && n < 3660) { n++; day = shiftDays(day, -1) }   /* 十年封顶，防数据坏了转不出来 */
  return n
}

export function toggleHabitLog(id, date) {
  const d = date || TODAY
  for (let i = 0; i < db.HABIT_LOGS.length; i++) {
    const h = db.HABIT_LOGS[i]
    if (h.key === id && h.date === d) { db.HABIT_LOGS.splice(i, 1); return false }
  }
  db.HABIT_LOGS.push({ key: id, date: d })
  return true
}

/* ---------------- 钱 ---------------- */
export function money(n) {
  const v = Math.round(Number(n) * 100) / 100
  if (v % 1 === 0) return '¥' + v
  return '¥' + v.toFixed(2).replace(/0$/, '')
}
export function sumByCategory(list) {
  const out = {}
  for (const l of (list || [])) {
    const c = l.category || '未分类'
    out[c] = (out[c] || 0) + Number(l.value || 0)
  }
  return out
}

/* ---------------- 记账品类 ---------------- */
/* 清单 + 历史里出现过、但已经不在清单里的（追加在最后）。
   编辑弹窗用它，这样删过类之后仍然能把老记录改回原来的类。 */
export function catList() {
  const out = db.CATS.slice(), seen = {}
  out.forEach(c => { seen[c] = 1 })
  for (const l of db.LOGS) {
    const c = l.category
    if (c && !seen[c]) { seen[c] = 1; out.push(c) }
  }
  return out
}
export function guessCategory(text) {
  const t = String(text == null ? '' : text)
  for (const k in db.CAT_WORDS) {
    if (!Object.prototype.hasOwnProperty.call(db.CAT_WORDS, k)) continue
    for (const w of db.CAT_WORDS[k]) {
      if (t.indexOf(w) >= 0) return k
    }
  }
  return ''
}

/* ---------------- 导航 ----------------
   切页只走这一处。原型的 go() 还要同时管三件事：页头标题、导航高亮、区块可见性 ——
   在 Vue 里那三样都是 CURRENT 的自然结果，所以这里只剩下「改 CURRENT」这一件事。
   但入口仍要唯一：散着改 CURRENT 的话，迟早有一处忘了带上别的动作。 */
export function go(name) {
  if (!name) return
  db.CURRENT = name
}

/* ---------------- 写 ---------------- */
let SEQ = 0
function newId(prefix) {
  SEQ += 1
  return prefix + Date.now().toString(36) + '-' + SEQ
}

export function addMoney(value, text, category) {
  const num = Number(value)
  if (!num || num <= 0) return null
  const rec = {
    id: newId('lg'), kind: 'money', date: TODAY,
    category: category || guessCategory(text) || '', value: num
  }
  db.LOGS.unshift(rec)
  return rec
}

export function addTodo(title, domainName) {
  const t = String(title || '').trim()
  if (!t) return null
  const rec = { id: newId('it'), title: t, domain: domainName || '', due: TODAY, status: 'todo', parent: null }
  db.ITEMS.unshift(rec)
  return rec
}

export function addInbox(text) {
  const t = String(text || '').trim()
  if (!t) return null
  const rec = { id: newId('in'), text: t, at: TODAY }
  db.INBOX.unshift(rec)
  return rec
}

/* 往某个记录项上记一条（体重 71.4、热量 1800、力量训练那一句…）。
   RECORD_TYPES[].logs[].d 是**展示用的中文串**，不是可算的 ISO ——
   这里跟原型保持一致，别自作聪明换成 ISO：换了以后复盘页按区间筛记录项
   就得再加一层解析，而那段代码现在还不存在。 */
export function addRecord(rtId, value) {
  const rt = db.RECORD_TYPES.filter(function (t) { return t.id === rtId })[0]
  if (!rt) return null
  const p = TODAY.split('-').map(Number)
  const rec = { id: newId('k'), d: p[1] + '月' + p[2] + '日', v: value }
  if (!rt.logs) rt.logs = []
  rt.logs.unshift(rec)
  return rec
}

/* 空间里所有能记的东西 —— 也就是「自定义」列出来的那份全集。
   顺序和开关都来自 db.CAP_CFG（见那边的注释）。

   这里是**唯一**的来源：面板上面那排横滑、和自定义列表，读的是同一份顺序。
   所以列表里挪一下，那一排立刻跟着变，中间不做任何映射。

   两个不进列表：`money`（支出走「记账」那条路，再放一个就重复了）、
   `on === false` 的（在数据层就被关掉的，不是用户偏好）。

   内置类目排在记录项前面 —— 待办 / 随心记 / 只丢进收件箱 是最常用的三个，
   它们该在横滑那排的前几格，不该被某天新加的记录项挤到后面去。 */
export function allCaptureOptions() {
  const out = []
  for (const m of db.CAPTURE_MODES) {
    if (m.on === false || m.k === 'money') continue
    out.push({ k: m.k, t: m.t, group: '内置类目', builtin: true, lock: !!m.lock })
  }
  for (const rt of db.RECORD_TYPES) {
    const d = domainById(rt.domain)
    out.push({
      k: 'rt:' + rt.id, t: rt.name, group: d ? d.name : '记录项',
      unit: rt.unit, builtin: false, lock: false
    })
  }

  /* 排序。锁住的（「自动判断」）永远在最前 —— 它是默认模式，也是规则猜不出来时的兜底，
     允许它被挪走或关掉的话，打开面板会出现「一个都没选中」的状态。 */
  const rank = {}
  const cfg = db.CAP_CFG || {}
  const ord = cfg.order || []
  ord.forEach(function (k, i) { rank[k] = i })
  out.sort(function (a, b) {
    if (a.lock !== b.lock) return a.lock ? -1 : 1
    const ra = rank[a.k] === undefined ? 1e9 : rank[a.k]
    const rb = rank[b.k] === undefined ? 1e9 : rank[b.k]
    return ra - rb
  })

  const cm = cfg.common || {}
  out.forEach(function (o) {
    o.on = (cm[o.k] === undefined) ? defaultCommon(o) : !!cm[o.k]
  })
  return out
}

/* 没被手动改过时，哪些算「常用」（进面板上面那排横滑）。
   照原型的 captureCandidates()：内置类目都算，记录项看 quick 标记。 */
function defaultCommon(o) {
  if (o.lock) return true
  if (o.builtin) return true
  const rt = db.RECORD_TYPES.filter(function (t) { return 'rt:' + t.id === o.k })[0]
  return !!(rt && rt.quick)
}

/* 上面那排横滑实际显示的那些 */
export function commonCaptureOptions() {
  return allCaptureOptions().filter(function (o) { return o.on })
}

/* 上下挪一位。挪的就是那一排的真实次序 ——
   列表里看到的顺序，就是记的时候看到的顺序，中间不做任何映射。 */
export function moveCaptureOption(key, delta) {
  const list = allCaptureOptions()
  const keys = list.map(function (o) { return o.k })
  const i = keys.indexOf(key)
  if (i < 0) return false
  if (list[i].lock) return false              /* 锁住的不参与排序 */
  const j = i + delta
  if (j < 0 || j >= keys.length) return false
  if (list[j].lock) return false              /* 也不能挪到锁住的前面去 */
  const t = keys[i]; keys[i] = keys[j]; keys[j] = t
  if (!db.CAP_CFG) db.CAP_CFG = { order: [], common: {} }
  db.CAP_CFG.order = keys
  return true
}

/* 开关。只管「进不进上面那排」，不影响它在自定义列表里的位置 ——
   关掉的东西还得能被重新打开，所以列表里始终留着它（变淡、开关显示关着）。 */
export function toggleCaptureCommon(key) {
  const o = allCaptureOptions().filter(function (x) { return x.k === key })[0]
  if (!o) return false
  if (o.lock) return true                     /* 锁住的关不掉，保持原样 */
  if (!db.CAP_CFG) db.CAP_CFG = { order: [], common: {} }
  if (!db.CAP_CFG.common) db.CAP_CFG.common = {}
  db.CAP_CFG.common[key] = !o.on
  return db.CAP_CFG.common[key]
}

/* 一键回到默认的开关和顺序 */
export function resetCaptureConfig() {
  db.CAP_CFG = { order: [], common: {} }
}

/* ---------------- 空间 ---------------- */
export function summaryOf(d, rtCount) {
  let s = d.todos.length + ' 项待办 · ' + d.habits.length + ' 个习惯 · ' + d.goals.length + ' 个目标'
  if (rtCount > 0) s += ' · ' + rtCount + ' 个记录项'
  return s
}
export function recordTypesOf(list, domainId) {
  return (list || []).filter(t => t.domain === domainId)
}
export function togglePin(id) {
  const d = domainById(id)
  if (!d) return false
  d.pinned = !d.pinned
  return d.pinned
}
export function newDomain(name) {
  const d = {
    id: 'd' + Date.now().toString(36),
    name: String(name || '').trim() || ('领域 ' + (db.DOMAINS.length + 1)),
    pinned: false, habits: [], todos: [], goals: []
  }
  db.DOMAINS.push(d)
  return d
}

/* 记账是一个**特殊空间**：占「空间」列表里的一个位置，但它是内置的 ——
   不能改名、不能删、也不能置顶，所以卡片上不给任何操作入口。

   它**不进 DOMAINS**，只是渲染时多出来的一张卡。这样做是因为数据层不必为它开特例：
   记账的数据（LOGS / CATS / RECORD_TYPES 里的钱那部分）本来就不是领域的那套结构，
   硬塞进 DOMAINS 得处处判空。 */
export const MONEY_SPACE = { id: 'money', name: '记账', fixed: true }
export function isMoneySpace(id) { return id === MONEY_SPACE.id }

/* 面板开合。
   kind 是面板里的模式：'quick' = 记一笔（写什么都行，规则自己判），
   'money' = 记账（先挑品类再填金额）。不传就保持当前那个。 */
export function openCapture(kind) {
  if (kind) db.CAPTURE_KIND = kind
  db.CAP_OPEN = true
}
export function closeCapture() {
  db.CAP_OPEN = false
}

/* ---------------- 今日页要用的几项 ---------------- */

/* 某个月的支出合计。传 '2026-09' 这样的前缀（原型的 sumByCategory 就是这个用法） */
export function moneyTotalOf(prefix) {
  let t = 0
  for (const l of db.LOGS) {
    if (l.kind !== 'money') continue
    if (String(l.date).slice(0, 7) !== prefix) continue
    t += Number(l.value || 0)
  }
  return Math.round(t * 100) / 100
}

/* 把一棵子项树展平成能直接 v-for 的数组。
 *
 * 为什么不写递归组件：Vue 里递归组件要额外处理 name 和 key，多一层要维护的东西；
 * 而这份数据本来就不深（原型里最深三层），展平之后一个 v-for 就够了。
 *
 * 每项带 depth 和 kids：前者管缩进，后者决定要不要画折叠箭头 ——
 * 没有子项的也要占住那个位置，否则同一列的名字会左右跳。
 * 折叠状态存在 db.CLOSED_NODES 里，和原型是同一份。 */
export function flattenTree(list, parentId, depth, out) {
  out = out || []
  const src = list || []
  const level = src.filter(function (x) { return (x.parent || null) === (parentId || null) })
  for (const node of level) {
    const kids = src.filter(function (x) { return (x.parent || null) === node.id })
    const closed = !!db.CLOSED_NODES[node.id]
    out.push({ node: node, depth: depth, kids: kids.length, closed: closed })
    if (kids.length && !closed) flattenTree(src, node.id, depth + 1, out)
  }
  return out
}

export function toggleFold(id) {
  if (!db.CLOSED_NODES) db.CLOSED_NODES = {}
  if (db.CLOSED_NODES[id]) delete db.CLOSED_NODES[id]
  else db.CLOSED_NODES[id] = true
  return !db.CLOSED_NODES[id]
}

/* 进度夹到 0~100。数据坏了（负数、超 100、不是数字）不能让进度条画到框外面 */
export function clampP(p) {
  const n = Number(p || 0)
  if (!isFinite(n) || n < 0) return 0
  return n > 100 ? 100 : Math.round(n)
}
