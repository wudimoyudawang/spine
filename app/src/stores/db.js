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
/* v2：待办合成一份存储了（ITEMS[].dom 存领域 id，DOMAINS 不再有 todos）。
   换 key 而不是加兼容读取 —— 旧档案里的待办有一半会长成没有内容的空行，
   那种「读进来但显示不对」比让人重新看一遍种子难查得多。 */
const LS_KEY = 'spine.state.v2'

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
/* 待办只有一份存储（ITEMS）。某一领域的待办 = 那份存储里 dom 指向它的这些条。
   按 **id** 归，不按领域名 —— 领域要能改名，用名字挂的话一改名就孤儿一片。 */
export function todosOf(domId) {
  return db.ITEMS.filter(function (i) { return (i.dom || '') === (domId || '') })
}
export function domainName(item) {
  const d = item && item.dom ? domainById(item.dom) : null
  return d ? d.name : '未归类'
}
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

/* 一次拿全：界面上「连续/累计」这两个数到处要，别让每处各算一遍。 */
export function habitStat(id, today) {
  return { cur: habitStreakDays(id, today), total: habitTotalDays(id) }
}

/* 「连续 N 天 · 累计 M 天」这句**只在这里说一次**。
 * 两个容易说错的地方，都是原型判过的：
 *   · 一次都没打过（total 0）→ 整句不显示。说「还没打卡」是错的：
 *     一个累计四十天、这周断了的人，也被那句话描述成了「从没开始过」。
 *   · 断了要说「连续 0 天」，不改词。换一句说法就等于换了一套算法。
 * on 只管要不要加重（连着的那几天值得亮一下），不影响数字。
 */
export function streakText(id, today) {
  const st = habitStat(id, today)
  if (!st.total) return null
  return { s: '连续 ' + st.cur + ' 天 · 累计 ' + st.total + ' 天', on: st.cur > 0 }
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

export function addTodo(title, domId, due) {
  const t = String(title || '').trim()
  if (!t) return null
  const rec = {
    id: newId('it'), title: t,
    dom: domainById(domId) ? domId : null,
    due: due === undefined ? TODAY : (due || null),
    status: 'todo', parent: null
  }
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
  let s = todosOf(d.id).length + ' 项待办 · ' + d.habits.length + ' 个习惯 · ' + d.goals.length + ' 个目标'
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
    pinned: false, habits: [], goals: []
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
 * 每项带 depth / kids / path：前者管缩进，kids 决定要不要画折叠箭头 ——
 * 没有子项的也要占住那个位置，否则同一列的名字会左右跳；
 * path 是上级路径，今日页不铺整棵树，子项那行得知道它挂在谁下面。
 * 折叠状态存在 db.CLOSED_NODES 里，和原型是同一份。 */
export function flattenTree(list, parentId, depth, out) {
  out = out || []
  const src = list || []
  const level = src.filter(function (x) { return (x.parent || null) === (parentId || null) })
  for (const node of level) {
    const kids = src.filter(function (x) { return (x.parent || null) === node.id })
    const closed = !!db.CLOSED_NODES[node.id]
    out.push({ node: node, depth: depth, kids: kids.length, closed: closed, path: nodePath(src, node) })
    if (kids.length && !closed) flattenTree(src, node.id, depth + 1, out)
  }
  return out
}

/* 展平后的行里数「几条」。只数顶层：子项是父项那件事的一部分，
   把它单独算一条会让人以为今天有一堆事，其实只是同一件拆了几步。
   今日页和领域页报的是同一个数，所以这个算法只在这里有一份。 */
export function topLevel(rows) {
  let n = 0
  for (const r of (rows || [])) if (!r.depth) n++
  return n
}

export function toggleFold(id) {  if (!db.CLOSED_NODES) db.CLOSED_NODES = {}
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

/* ================= 行的可操作性：新增 / 编辑 / 删除 / 加子项 =================
 *
 * 每一行用同一个 spec 字符串认自己：`item:<id>` / `habit:<id>` / `goal:<id>`。
 * 折叠、加子项、删除、点开编辑全读这一个串，
 * 所以今日页和领域页能对同一份数据说同一套话，行组件也只有一份。
 *
 * 为什么不用数组下标：删掉中间一个，后面全部错位。
 *
 * 四条从原型抄下来的规矩，容易看漏：
 *   ① 子项关系**只在创建那一刻定死**，之后没有任何改上级的入口（宇明确要求）。
 *      所以编辑弹窗里没有「上级」字段、这边也没有改 parent 的函数；
 *      「防环」因此天然成立 —— 新建时 parent 指向一条已存在的条目，而它还没有后代。
 *   ② 删掉一条只把它自己拿掉，**子项上移一层接管它的位置**（分类可以错，数据不该丢）。
 *   ③ 弹窗里的改动先落草稿，点「保存」才写回；取消＝整个丢弃。
 *   ④ 有副作用的写入只能有一个入口。删除全走 deleteNode，新增全走 addEntry/addSub。
 */

export function specOf(kind, nodeOrId) {
  const id = typeof nodeOrId === 'object' && nodeOrId ? nodeOrId.id : nodeOrId
  return kind + ':' + id
}

/* 领域里那两棵树。待办不在这里 —— 它住在 ITEMS，用 todosOf(领域id) 取。 */
export function domainBucket(d, k) {
  if (!d) return []
  if (k === 'habit') return d.habits || []
  return d.goals || []
}
/* 今日页的待办用 title，领域里的习惯和目标用 t。一个函数吃掉这个差别，
   免得每个显示的地方各判一次 —— 漏一处就是一片空白 */
export function labelOf(node) {
  return node ? String(node.title || node.t || '') : ''
}
function nodeOf(d, k, id) {
  return domainBucket(d, k).filter(x => x.id === id)[0] || null
}

/* spec → { kind, node, list, domain }。找不到返回 null（可能刚被另一处删掉） */
export function resolveNode(spec) {
  const s = String(spec || '')
  const cut = s.indexOf(':')
  const kind = cut < 0 ? s : s.slice(0, cut)
  const key = cut < 0 ? '' : s.slice(cut + 1)
  if (kind === 'item') {
    const node = itemById(key)
    /* 待办的 domain 从它自己的 dom 字段来 —— 今日页要的是「这条属于哪个领域」，
       而「在哪个页面上被删的」不相干。 */
    if (node) return { kind, node, list: db.ITEMS, domain: node.dom ? domainById(node.dom) : null }
    return null
  }
  if (kind === 'habit' || kind === 'goal') {
    for (const d of db.DOMAINS) {
      const node = nodeOf(d, kind, key)
      if (node) return { kind, node, list: domainBucket(d, kind), domain: d }
    }
  }
  return null
}

/* 一条的上级路径，如「知识库项目上线 / 周三前」。没有上级就是空串。
 * 今日页不铺整棵树，所以子项那行必须写清它挂在谁下面 —— 这是只读展示，不是入口。 */
export function nodePath(list, node) {
  const byId = {}
  for (const x of (list || [])) byId[x.id] = x
  const names = []
  let id = node && node.parent, guard = 0
  while (id && guard++ < 12) {
    const p = byId[id]
    if (!p) break
    names.unshift(labelOf(p))
    id = p.parent
  }
  return names.join(' / ')
}

/* 跨领域的两棵树：今日页的习惯块和计划块。
 * 一份构建处 —— 今日页和领域页读的是同一批行对象，只是这里多带一个 dom。 */
function crossTree(k) {
  const out = []
  for (const d of db.DOMAINS) {
    const list = domainBucket(d, k)
    for (const r of flattenTree(list, null, 0)) {
      out.push({ node: r.node, depth: r.depth, kids: r.kids, closed: r.closed, path: r.path, dom: d, list, spec: specOf(k, r.node.id) })
    }
  }
  return out
}
export function habitTree() { return crossTree('habit') }
export function goalTree() { return crossTree('goal') }

/* 今日页的待办树（已过期 / 今天 两块）。两条规矩都是原型的：
 *   ① 子项跟着父项走 —— 父项在今天的列表里，子项就挂在它下面，
 *      **不看子项自己的到期日**（子项是「这件事的一部分」，不是另一个独立承诺）。
 *   ② 只从顶层开始铺。从每一项开始铺，父项行和子项行会各出现一遍。 */
export function todayTree(today) {
  const t = today || TODAY
  const r = pickToday(db.ITEMS, t)
  const picked = {}
  r.overdue.forEach(x => { picked[x.id] = 1 })
  r.due.forEach(x => { picked[x.id] = 1 })
  function emit(node, depth, over, out, seen) {
    if (seen[node.id]) return
    seen[node.id] = 1
    const kids = kidsOf(db.ITEMS, node.id)
    out.push({ node, depth, kids: kids.length, closed: !!db.CLOSED_NODES[node.id], over, path: nodePath(db.ITEMS, node), spec: specOf('item', node.id) })
    if (db.CLOSED_NODES[node.id]) return
    for (const k of kids) emit(k, depth + 1, over, out, seen)
  }
  function build(src, over) {
    const out = [], seen = {}
    for (const it of src) {
      if (it.parent && picked[it.parent]) continue
      emit(it, 0, over, out, seen)
    }
    return out
  }
  return { overdue: build(r.overdue, true), due: build(r.due, false) }
}

/* ---------------- 今天记下的（操作流水） ----------------
 * 只有这一处写。改了但没改出差别的（见 commitEdit 里那句「没有改动」）不要记 ——
 * 流水里塞一堆空记录，等于把真正那条冲掉了。 */
export function pushTodayLog(op, target, detail, label) {
  const now = new Date()
  db.TODAY_LOGS.unshift({
    time: pad2(now.getHours()) + ':' + pad2(now.getMinutes()),
    op, target, detail, label
  })
}

/* ---------------- 新增 ---------------- */
/* 三个区块共用的配置。字段少是有意的：一次编辑只问「叫什么 + 一句说明」，
   多一个必填就多一次犹豫。 */
export const ADD_KINDS = {
  todo: { title: '新增待办', note: '一次就完的事', nameK: '待办内容（必填）', namePh: '比如：周五前交周报' },
  habit: { title: '新增习惯', note: '要重复做的事', nameK: '习惯内容（必填）', namePh: '比如：每天散步 30 分钟', metaPh: '比如：每天 / 工作日' },
  goal: { title: '新增长期计划', note: '要长期推进的事', nameK: '目标名称（必填）', namePh: '比如：读完《置身事内》', metaPh: '比如：每周 30 页 · 已读 210/350 页' }
}

export const ADD = reactive({ on: false, kind: 'todo', space: '', parent: null, parentName: '' })

/* 三类条目各有各的去处，但**不各有各的存储**：
   待办全在 ITEMS（领域写在 dom 字段上），习惯和目标在所属领域的桶里。
   这里不再为「从哪个页面点进来」分叉 —— 那个分叉曾经造成种子里五条待办存两遍。 */
export function openAdd(kind, opts) {
  const cfg = ADD_KINDS[kind]
  if (!cfg) return false
  const o = opts || {}
  ADD.kind = kind
  ADD.parent = o.parent || null
  ADD.space = domainById(o.space) ? o.space
    : (db.CURRENT && domainById(db.CURRENT) ? db.CURRENT : (db.DOMAINS[0] ? db.DOMAINS[0].id : ''))
  /* 父项的名字在这里就取好。弹窗开着的时候那条可能被删掉 ——
     到那时再去解析只会显示空，而「挂在下面」这句话必须说得出挂给谁。 */
  ADD.parentName = ADD.parent ? labelOf(findAddParent()) : ''
  ADD.on = true
  return true
}
/* 父项在哪：待办在 ITEMS，习惯和目标在选定领域的桶里。 */
function findAddParent() {
  if (ADD.kind === 'todo') return itemById(ADD.parent)
  const d = domainById(ADD.space)
  return d ? nodeOf(d, ADD.kind, ADD.parent) : null
}
export function closeAdd() {
  ADD.on = false
  ADD.parent = null
  ADD.parentName = ''
}
export function pickAddSpace(id) {
  if (domainById(id)) ADD.space = id
}

function entryId(kind, d) {
  SEQ += 1
  if (kind === 'habit') return 'h-' + d.id + '-' + Date.now() + '-' + SEQ
  return 'g-' + Date.now() + '-' + SEQ
}
function newNode(kind, text, meta) {
  const m = String(meta || '').trim()
  if (kind === 'habit') return { t: text, m: m || '每天' }
  return { t: text, m, p: 0 }
}

export function commitAdd(text, meta) {
  const t = String(text || '').trim()
  if (!t) return { error: '先写点什么' }
  const d = domainById(ADD.space)
  if (!d) return { error: '先选一个空间' }
  const kind = ADD.kind
  const kindName = kind === 'todo' ? '待办' : kind === 'habit' ? '习惯' : '长期计划'
  /* 上级要真的还在才挂上去 —— 防着「弹窗开着的时候那一条被删了」 */
  const p = ADD.parent ? findAddParent() : null
  const pid = p ? p.id : null
  let node, detail
  if (kind === 'todo') {
    /* 待办的第二个字段是**到期日**，不是自由说明。
       存储合并之后这边只剩一种待办，那个字段该问什么也就只有一个答案：
       有日期就进今日页，没日期就是清单上的一条。 */
    const due = p && p.due ? p.due : (meta === 'none' ? null : (meta || TODAY))
    node = addTodo(t, d.id, due)
    if (pid) node.parent = pid
    detail = due ? (due === TODAY ? '今天' : due) : '没有日期'
  } else {
    node = newNode(kind, t, meta)
    node.id = entryId(kind, d)
    node.parent = pid
    domainBucket(d, kind).push(node)
    detail = node.m
  }
  if (pid) delete db.CLOSED_NODES[pid]
  const where = d.name + (p ? ' / ' + labelOf(p) : '')
  ADD.on = false
  ADD.parent = null
  ADD.parentName = ''
  pushTodayLog('新增', t, where + ' · ' + kindName, '新增' + kindName + ' · ' + t)
  return { node, domain: d, kind, kindName, where, detail }
}

/* 在某一条下面就地加一条**同类**的子项。
 * 待办的子项继承父项的领域和日期 —— 否则它会因为自己的日期掉出今天的列表，
 * 挂在一条今天到期的事下面、却看不见，那比没有子项更让人困惑。 */
export function addSub(spec, text) {
  const t = String(text || '').trim()
  const hit = resolveNode(spec)
  if (!hit) return { error: '这条已经不在了' }
  if (!t) return { error: '' }
  const p = hit.node
  let node
  if (hit.kind === 'item') {
    node = { id: newId('it'), title: t, dom: p.dom || null, due: p.due || null, status: 'todo', parent: p.id }
    db.ITEMS.push(node)
  } else {
    node = newNode(hit.kind, t, '')
    node.id = entryId(hit.kind, hit.domain)
    node.parent = p.id
    /* 新加的排最前（和原型一致：同级没有排序控件，数组顺序就是看到的顺序） */
    hit.list.unshift(node)
  }
  delete db.CLOSED_NODES[p.id]
  const kindName = hit.kind === 'habit' ? '习惯' : hit.kind === 'goal' ? '长期计划' : '待办'
  pushTodayLog('新增', t,
    (hit.domain ? hit.domain.name + ' · ' : '') + '「' + labelOf(p) + '」的子项',
    '新增子项 · ' + t)
  return { node, parent: p, kindName }
}

/* ---------------- 编辑 ---------------- */
export const ED = reactive({ on: false, spec: '', kind: '', title: '', where: '', draft: {} })

/* 字段按类型生成，不是每种条目各写一个弹窗。
   这里**没有任何「上级」字段**：子项关系建完就锁死，不给改。 */
export function editFields() {
  if (ED.kind === 'item') {
    return [
      { k: 'title', label: '内容（必填）', type: 'text' },
      { k: 'due', label: '到期日', type: 'date' },
      { k: 'status', label: '状态', type: 'chips', opts: [['todo', '待办'], ['done', '已完成']] },
      { k: 'dom', label: '领域', type: 'chips', opts: domainOpts() }
    ]
  }
  if (ED.kind === 'habit') {
    return [
      { k: 't', label: '习惯（必填）', type: 'text' },
      { k: 'm', label: '频率，选填', type: 'text' }
    ]
  }
  return []
}
/* 领域的候选按 **id** 取值、按名字显示。用名字当值的话，
   一改名，所有挂在旧名字上的待办就全成了孤儿。 */
export function domainOpts() {
  const out = [['', '未归类']]
  for (const d of db.DOMAINS) out.push([d.id, d.name])
  return out
}

export function openEdit(spec) {
  const hit = resolveNode(spec)
  if (!hit) return { error: '这条已经不在了' }
  /* 计划行走它自己的弹窗（进度滑杆在下一轮搬），先不开这个 ——
     开一个少了进度字段的编辑弹窗，比不开更容易让人以为进度就在里面 */
  if (hit.kind === 'goal') return { error: '' }
  const d = hit.domain
  ED.spec = spec
  ED.kind = hit.kind
  ED.draft = hit.kind === 'item'
    ? { title: hit.node.title, due: hit.node.due || '', dom: hit.node.dom || '', status: hit.node.status || 'todo' }
    : { t: labelOf(hit.node), m: hit.node.m || '' }
  ED.title = hit.kind === 'habit' ? '修改习惯' : '修改待办'
  ED.where = hit.kind === 'item' ? domainName(hit.node) : (d ? d.name : '')
  ED.on = true
  return { ok: true }
}
export function closeEdit() {
  ED.on = false
  ED.spec = ''
  ED.draft = {}
}

export function commitEdit() {
  const hit = resolveNode(ED.spec)
  if (!hit) { closeEdit(); return { error: '这条已经不在了' } }
  const dr = ED.draft
  const ch = []
  let target = ''
  if (ED.kind === 'item') {
    const it = hit.node
    const t1 = String(dr.title || '').trim()
    if (!t1) return { error: '内容不能空' }
    const st0 = it.status || 'todo', st1 = dr.status || 'todo'
    if (it.title !== t1) ch.push('内容「' + it.title + '」→「' + t1 + '」')
    if ((it.due || '') !== (dr.due || '')) ch.push('到期日 ' + (it.due || '没有') + ' → ' + (dr.due || '没有'))
    if ((it.dom || '') !== (dr.dom || '')) ch.push('领域「' + domainName(it) + '」→「'
      + (dr.dom && domainById(dr.dom) ? domainById(dr.dom).name : '未归类') + '」')
    if (st0 !== st1) ch.push('状态 ' + (st0 === 'done' ? '已完成' : '待办') + ' → ' + (st1 === 'done' ? '已完成' : '待办'))
    if (ch.length) { it.title = t1; it.due = dr.due || null; it.dom = dr.dom || null; it.status = st1 }
    target = t1
  } else {
    const nd = hit.node
    const t2 = String(dr.t || '').trim()
    if (!t2) return { error: ED.kind === 'habit' ? '习惯不能空' : '内容不能空' }
    if (nd.t !== t2) ch.push('内容「' + nd.t + '」→「' + t2 + '」')
    if ((nd.m || '') !== (dr.m || '')) ch.push((ED.kind === 'habit' ? '频率「' : '说明「') + (nd.m || '（空）') + '」→「' + (dr.m || '（空）') + '」')
    if (ch.length) { nd.t = t2; nd.m = dr.m }
    target = t2
  }
  if (!ch.length) { closeEdit(); return { unchanged: true } }
  /* parent 一律不动：这个弹窗里没有、也不该有改上级的入口 */
  const kindName = ED.kind === 'habit' ? '习惯' : '待办'
  const where = hit.domain ? hit.domain.name : (ED.kind === 'item' ? domainName(hit.node) : '')
  pushTodayLog('修改', target, where + ' · ' + kindName, '修改' + kindName + ' · ' + target)
  closeEdit()
  return { changed: ch }
}

/* ---------------- 删除：两段确认 ----------------
 * 第一下只「武装」（变红、文案变「确认删」），第二下才真删；4 秒无操作自动回退，
 * 换一处武装会先把上一处解除 —— 所以同一时刻全局只可能有一个待确认，
 * 不会出现「两个红按钮不知道点哪个」。 */
export const delArmed = ref('')
let delTimer = null

export function disarmDelete() {
  delArmed.value = ''
  if (delTimer) { clearTimeout(delTimer); delTimer = null }
}

/* 返回 null = 只是武装起来了；返回对象 = 真的删了 */
export function armDelete(spec) {
  if (delArmed.value === spec) {
    disarmDelete()
    return deleteNode(spec)
  }
  disarmDelete()
  delArmed.value = spec
  /* 比 3 秒长一点：手滑点歪了还能回来，但又不至于让人以为它在等一个决定 */
  delTimer = setTimeout(disarmDelete, 4000)
  return null
}

/* 删一条只把它自己拿掉，直接子项上移一层接管它的位置。
   「分类可以错，数据不该丢」这条对子项同样成立。 */
function releaseKids(list, node) {
  if (!node) return
  for (const k of (list || [])) {
    if (k.parent === node.id) k.parent = node.parent || null
  }
}
function dropHabitLogs(id) {
  for (let i = db.HABIT_LOGS.length - 1; i >= 0; i--) {
    if (db.HABIT_LOGS[i].key === id) db.HABIT_LOGS.splice(i, 1)
  }
}

export function deleteNode(spec) {
  const s = String(spec || '')
  const cut = s.indexOf(':')
  const kind = cut < 0 ? s : s.slice(0, cut)
  const key = cut < 0 ? '' : s.slice(cut + 1)
  let done = null
  if (kind === 'money') {
    const l = db.LOGS.filter(x => x.id === key)[0]
    if (l) {
      done = { what: '一笔支出', label: (l.category || '未分类') + ' ' + money(l.value) }
      db.LOGS.splice(db.LOGS.indexOf(l), 1)
    }
  } else if (kind === 'note') {
    const n = db.NOTES.filter(x => x.id === key)[0]
    if (n) {
      done = { what: '随心记', label: String(n.text || '').slice(0, 20) }
      db.NOTES.splice(db.NOTES.indexOf(n), 1)
    }
  } else if (kind === 'inbox') {
    const n = db.INBOX.filter(x => x.id === key)[0]
    if (n) {
      done = { what: '收件箱的一条', label: String(n.text || '').slice(0, 20) }
      db.INBOX.splice(db.INBOX.indexOf(n), 1)
    }
  } else {
    const hit = resolveNode(s)
    if (hit) {
      releaseKids(hit.list, hit.node)
      hit.list.splice(hit.list.indexOf(hit.node), 1)
      /* 打卡记录跟着习惯一起清，不留孤儿数据：
         不然那个习惯早就不在了，HABIT_LOGS 里还有一串 key 指向它 */
      if (hit.kind === 'habit') dropHabitLogs(hit.node.id)
      delete db.CLOSED_NODES[hit.node.id]
      done = {
        what: hit.kind === 'habit' ? '习惯' : hit.kind === 'goal' ? '长期计划' : '待办',
        label: labelOf(hit.node),
        where: hit.domain ? hit.domain.name : ''
      }
    }
  }
  if (!done) return { error: '这条已经不在了' }
  pushTodayLog('删除', done.label, (done.where ? done.where + ' · ' : '') + done.what,
    '删除' + done.what + ' · ' + done.label)
  return done
}

/* ================= 长期计划的进度 =================
 * 计划行上有两个写入口：拖滑杆、点 +1/+2/+5。它们改的是同一个 p，
 * 所以必须有一份仲裁 —— 某些端在程序把滑杆值改回去之后，还会补发一个旧的
 * input 事件；不挡的话刚按 +5 就被那根杠拽回原位，点了像没点。
 * （原型里是 GOAL_LOCK，规矩照抄。）
 *
 * 弹窗里改的是**草稿**，点「确认」才写回 —— 和编辑弹窗同一套。
 */
export const GOAL_STEPS = [1, 2, 5]

/* 进度从哪儿读：弹窗开着就读草稿，否则读真实那条。
   一个函数管这件事，页面上的百分比和弹窗里的滑杆才不会各说一套。 */
/* 收三种写法：计划行对象、'goal:xx' 这种 spec、光秃秃的 id。
   页面上拿到的是 spec，弹窗里拿到的是草稿，这里一处吃掉差别。 */
export function progressOf(nodeOrSpec) {
  const n = typeof nodeOrSpec === 'object' && nodeOrSpec ? nodeOrSpec : null
  const id = n ? n.id : specKey(nodeOrSpec)
  if (GOAL.on && GOAL.draft.id === id) return clampP(GOAL.draft.p)
  if (n) return clampP(n.p)
  const hit = resolveNode('goal:' + id)
  return hit ? clampP(hit.node.p) : 0
}

const goalLock = {}

/* via: 'slider' | 'button'。返回真正生效后的值；返回 null = 这次被仲裁挡掉了 */
export function setGoalP(spec, next, via) {
  const id = specKey(spec)
  if (via === 'slider' && goalLock[id] && Date.now() < goalLock[id]) return null
  const p = clampP(next)
  if (GOAL.on && GOAL.draft.id === id) { GOAL.draft.p = p; return p }
  const hit = resolveNode(spec)
  if (!hit || hit.kind !== 'goal') return null
  hit.node.p = p
  if (via === 'button') goalLock[id] = Date.now() + 250
  else delete goalLock[id]           /* 又动手拖了，说明仲裁窗口该结束了 */
  return p
}

function specKey(spec) {
  const s = String(spec || '')
  const cut = s.indexOf(':')
  return cut < 0 ? s : s.slice(cut + 1)
}

export function bumpGoal(spec, step) {
  const cur = progressOf(spec)
  return setGoalP(spec, cur + (Number(step) || 0), 'button')
}

/* 弹窗那份草稿。id 用一个固定的假 id —— 草稿不是数据，
   不该和任何真条目共用 id 空间，setGoalP 靠这个串认它是草稿。 */
export const GOAL_DRAFT_ID = '__goal_draft__'

export const GOAL = reactive({
  on: false, mode: 'edit', spec: '', domainId: '', title: '',
  parent: null, parentName: '',
  draft: { id: GOAL_DRAFT_ID, t: '', m: '', p: 0 },
  orig: { t: '', m: '', p: 0 }
})

export function openGoal(spec) {
  const hit = resolveNode(spec)
  if (!hit || hit.kind !== 'goal') return { error: '这条已经不在了' }
  GOAL.mode = 'edit'
  GOAL.spec = spec
  GOAL.domainId = hit.domain ? hit.domain.id : ''
  GOAL.title = '调整长期计划'
  GOAL.draft = { id: GOAL_DRAFT_ID, t: labelOf(hit.node), m: hit.node.m || '', p: clampP(hit.node.p) }
  GOAL.orig = { t: labelOf(hit.node), m: hit.node.m || '', p: clampP(hit.node.p) }
  GOAL.on = true
  return { ok: true }
}

/* 从区块标题或某条计划下面新建。父项在建好之后就锁死了，所以这里问一次就够。 */
export function openGoalAdd(domainId, parentId, parentName) {
  const d = domainById(domainId) || (db.DOMAINS[0] ? domainById(db.DOMAINS[0].id) : null)
  if (!d) return { error: '先建一个空间' }
  GOAL.mode = 'new'
  GOAL.spec = ''
  GOAL.domainId = d.id
  GOAL.title = '新增长期计划'
  GOAL.parent = parentId || null
  GOAL.parentName = parentId ? (parentName || '') : ''
  GOAL.draft = { id: GOAL_DRAFT_ID, t: '', m: '', p: 0 }
  GOAL.orig = { t: '', m: '', p: 0 }
  GOAL.on = true
  return { ok: true }
}

export function closeGoal() {
  GOAL.on = false
  GOAL.spec = ''
  GOAL.parent = null
  GOAL.parentName = ''
  delete goalLock[GOAL_DRAFT_ID]
}

/* 逐字段比出「具体变更内容」。返回空数组 = 没有改动。
   只比这三样：parent 创建后不给改，所以不在比对范围内。 */
function goalDiff(orig, now) {
  const out = []
  if (orig.t !== now.t) out.push('名称「' + orig.t + '」→「' + now.t + '」')
  if ((orig.m || '') !== (now.m || '')) out.push('说明「' + (orig.m || '（空）') + '」→「' + (now.m || '（空）') + '」')
  if (orig.p !== now.p) out.push('进度 ' + orig.p + '% → ' + now.p + '%')
  return out
}

export function commitGoal() {
  const t = String(GOAL.draft.t || '').trim()
  if (!t) return { error: '先写个目标名称' }
  const m = String(GOAL.draft.m || '').trim()
  const p = clampP(GOAL.draft.p)
  const d = domainById(GOAL.domainId)
  if (!d) { closeGoal(); return { error: '这个空间已经不在了' } }

  if (GOAL.mode === 'new') {
    const node = { id: entryId('goal', d), t: t, m: m, p: p, parent: GOAL.parent || null }
    d.goals.push(node)
    if (node.parent) delete db.CLOSED_NODES[node.parent]
    const pth = node.parent ? ' / ' + (GOAL.parentName || '') : ''
    pushTodayLog('新增', t, '新建于「' + d.name + pth + '」· 进度 ' + p + '%', '长期计划 · ' + t)
    closeGoal()
    return { node: node, created: true, p: p }
  }

  const hit = resolveNode(GOAL.spec)
  if (!hit) { closeGoal(); return { error: '这条已经不在了' } }
  const ch = goalDiff(GOAL.orig, { t: t, m: m, p: p })
  if (!ch.length) { closeGoal(); return { unchanged: true } }
  /* parent 一律不动：子项关系只在创建时定 */
  hit.node.t = t
  hit.node.m = m
  hit.node.p = p
  pushTodayLog('修改', t, ch.join('；'), '长期计划 · ' + t)
  closeGoal()
  return { changed: ch, node: hit.node, p: p }
}
