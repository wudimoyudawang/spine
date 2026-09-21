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
  ensureIds()
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
  ensureIds()
}

/* 导入 = 用文件里那份**整体换掉**本机这份。所以先把文本验一遍再换：
   换到一半才报错是最坏的一种失败 —— 屏幕上看着是新数据，存储里却是旧的。
   返回空串 = 成功；否则返回一句人话，给界面直接显示。 */
export function importSnapshot(raw) {
  let s = null
  try { s = JSON.parse(String(raw || '')) } catch (e) { return '这不是 JSON' }
  if (!s || typeof s !== 'object' || !s.v || typeof s.v !== 'object') return '不是这个应用导出的文件'
  /* 至少要有一样是数组，否则是个空对象，换过去等于把数据清空了还一声不吭 */
  const has = DATA_KEYS.some(function (k) { return Array.isArray(s.v[k]) })
  if (!has) return '这个文件里没有任何数据'
  /* 导入的是数据，不该顺手把人从当前这一页踢走（领域页除外：那个领域可能不在了） */
  const back = db.CURRENT === 'domain' ? 'spaces' : db.CURRENT
  try {
    restore(JSON.stringify(s))
  } catch (e) { return '文件内容读不出来' }
  db.CURRENT = back
  saveState(true)
  return ''
}

/* 老档案缺 id 的要补上：流水行的 id 是后加的，记录项的日志 id 也是。
   少一个入口是一回事，整份数据打不开是另一回事。 */
function ensureIds() {
  ensureLogIds()
  for (const rt of db.RECORD_TYPES || []) {
    for (const l of (rt.logs || [])) { if (!l.id) l.id = newId('k') }
  }
  for (const l of db.LOGS || []) { if (!l.id) l.id = newId('lg') }
  for (const it of db.ITEMS || []) { if (!it.id) it.id = newId('it') }
  for (const n of db.NOTES || []) { if (!n.id) n.id = newId('nt') }
  for (const n of db.INBOX || []) { if (!n.id) n.id = newId('in') }
}

/* 流水行的 id 是后加的（「移除这一行」要用它，数组下标不行）。
   老档案里没有的那些就地补上 —— 少一个入口是一回事，整份数据打不开是另一回事。 */
function ensureLogIds() {
  const L = db.TODAY_LOGS || []
  for (const e of L) { if (!e.id) e.id = newId('tl') }
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
/* 分类候选。'未分类' 永远给选 —— 存的时候它是空串，
   但打开老记录时显示的就是它，选不到等于改不动。 */
function catOpts() {
  const list = catList().filter(function (c) { return c !== '未分类' })
  const out = list.map(function (c) { return [c, c] })
  out.push(['未分类', '未分类'])
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

/* 某个品类被记过多少笔。删之前要看得见下面挂着几条 ——
   「删掉不影响已记的」不是空话，得有个地方能核对。 */
export function catUsed(name) {
  let n = 0
  for (const l of db.LOGS) { if (l.category === name) n++ }
  return n
}

function catClash(name, except) {
  return db.CATS.indexOf(name) >= 0 && name !== except
}

export function addCat(name) {
  const v = String(name || '').trim()
  if (!v) return { error: '先写个名字' }
  if (catClash(v)) return { error: '已经有「' + v + '」了' }
  db.CATS.push(v)
  return { name: v }
}

/* 改名要把已记的那几笔一起改过来，否则分类柱状图会裂成两根
   （旧名一根、新名一根），看着像数据坏了。
   顺手把「自动猜」那张表也换名：不换的话旧名字再也不会出现在清单里，
   猜出来的分类没人认得出。 */
export function renameCat(from, name) {
  const v = String(name || '').trim()
  const i = db.CATS.indexOf(from)
  if (i < 0) return { error: '这个品类已经不在了' }
  if (!v) return { error: '先写个名字' }
  if (catClash(v, from)) return { error: '已经有「' + v + '」了' }
  if (v === from) return { name: v, moved: 0 }
  db.CATS[i] = v
  let moved = 0
  for (const l of db.LOGS) { if (l.category === from) { l.category = v; moved++ } }
  if (db.CAT_WORDS[from]) {
    db.CAT_WORDS[v] = db.CAT_WORDS[from]
    delete db.CAT_WORDS[from]
  }
  return { name: v, moved: moved }
}

/* 删一个品类只把它从清单里拿走。已记的那几笔一个字不改 ——
   它们还带着旧分类，所以 catList() 会把它补回候选末尾，
   老记录照样能改回这个类。（分类可以错，数据不该丢。） */
export function delCat(name) {
  const i = db.CATS.indexOf(name)
  if (i < 0) return { error: '这个品类已经不在了' }
  const used = catUsed(name)
  db.CATS.splice(i, 1)
  return { name: name, used: used }
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
    category: category || guessCategory(text) || '', value: Math.round(num * 100) / 100
  }
  db.LOGS.unshift(rec)
  /* 「记下这笔」和「今天流水里有它」是同一个动作的两半，所以写在同一个入口里。
     记支出的有两个入口（速记面板、记账页那个框），散在两处写流水迟早漏一个。 */
  pushTodayLog('', '', '', describeCapture({ kind: 'money', value: rec.value, category: rec.category }),
    { k: 'money', id: rec.id })
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

/* 随心记：只写日期和正文，没有领域、没有分类、不进复盘。
   三个地方要写它（随心记页、速记面板、收件箱归类），所以入口只有一个。 */
export function addNote(text) {
  const t = String(text || '').trim()
  if (!t) return null
  const rec = { id: newId('nt'), d: TODAY, text: t }
  db.NOTES.unshift(rec)
  return rec
}

/* 往某个记录项上记一条（体重 71.4、热量 1800、力量训练那一句…）。
   RECORD_TYPES[].logs[].d 是**展示用的中文串**，不是可算的 ISO ——
   这里跟原型保持一致，别自作聪明换成 ISO：换了以后复盘页按区间筛记录项
   就得再加一层解析，而那段代码现在还不存在。 */
export function addRecord(rtId, value) {
  const rt = rtById(rtId)
  if (!rt) return null
  const p = TODAY.split('-').map(Number)
  const rec = { id: newId('k'), d: p[1] + '月' + p[2] + '日', v: value }
  if (!rt.logs) rt.logs = []
  rt.logs.unshift(rec)
  /* 和记支出同一规矩：流水里那一行连着这条真实记录，点得开、改得动。
     措辞直接借「会记成」那句 —— 记之前看到什么，记完在流水里就看到什么。 */
  pushTodayLog('', '', '', describeCapture({
    kind: 'rt', rt: rt,
    value: rt.mode === 'number' ? Number(value) : null,
    text: rt.mode === 'number' ? '' : String(value == null ? '' : value)
  }), { k: 'rt', rtId: rt.id, logId: rec.id })
  return rec
}

/* 收件箱里那一条的去处。四个去处都是「变成别处的正经条目」，然后从这儿消失 ——
   收件箱只管先记下来，不留存。
   「今天的待办」钉在今天；给某个领域的**不带日期**（原型那句 m:'没有日期'）——
   扔进领域清单等着排期，比硬塞一个今天诚实。 */
export function classifyInbox(id, to) {
  const it = db.INBOX.filter(function (x) { return x.id === id })[0]
  if (!it) return { error: '这条已经不在了' }
  let where = ''
  if (to === 'todo') { addTodo(it.text, '', TODAY); where = '今天 · 待办' }
  else if (to === 'note') { addNote(it.text); where = '随心记' }
  else {
    const d = domainById(to)
    if (!d) return { error: '这个领域已经不在了' }
    addTodo(it.text, d.id, null)
    where = d.name + ' · 待办'
  }
  const text = it.text
  db.INBOX.splice(db.INBOX.indexOf(it), 1)
  pushTodayLog('归类', text, where, '归类 · ' + text)
  return { where: where, text: text }
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
    if (rt.retired) continue   /* 已经从界面收起的不再出现在这一排 */
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

/* ---------------- 自动判断的规则表 ----------------
   一句话进来 → 它该被记成什么。纯规则，没有 AI：只有关键词和正则两种条件，
   你能自己写完、也能自己看懂 —— 这是这台设备上「识别」的全部承诺。

   规则对象：{id, sys, on, t, kw | re, ex, to, max}
     kw = 关键词，逗号（或空格）分隔，提到一个就算命中
     re = 正则，和 kw 二选一，两个都写时 kw 优先
     ex = 排除式正则，命中就不采用这条规则
     max = 句子超过这么长就不参与判断
     to = 判成什么：money / money:分类 / todo / note / inbox / 某条记录项的 id

   【你自己写的规则永远排在内置前面】—— addRule 只往最前面插，moveRule 不许跨组。
   你写的那条应该压过我的默认判断，不然它就没有存在的意义。 */
export function rtById(id) {
  return db.RECORD_TYPES.filter(function (t) { return t.id === id })[0] || null
}

export function firstNumber(t) {
  const m = String(t == null ? '' : t).match(/\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

/* 把数字和单位从原句里挖掉，剩下的是这条记录的正文。
   不减掉的话「体重 71.4 kg」会存成 v=71.4、正文又写回整句，读的人不知道哪个作数。 */
export function restOf(t, num) {
  let s = String(t == null ? '' : t)
  if (num !== null && num !== undefined) s = s.replace(String(num), ' ')
  s = s.replace(/kcal|千卡|大卡|卡路里|kg|公斤|千克|斤|元|块|¥|￥/gi, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

export function ruleName(r) {
  if (!r) return '未命名规则'
  return r.t || r.kw || r.re || '未命名规则'
}

/* 一条规则是否命中这句话。 */
export function ruleMatches(rule, text) {
  const t = String(text == null ? '' : text)
  if (!rule || !t) return false
  if (rule.max && t.length > rule.max) return false
  let hit = false
  if (rule.kw) {
    const low = t.toLowerCase()
    const ws = String(rule.kw).split(/[,，\s]+/)
    for (const w of ws) {
      if (w && low.indexOf(w.toLowerCase()) >= 0) { hit = true; break }
    }
  } else if (rule.re) {
    try { hit = new RegExp(rule.re).test(t) } catch (e) { hit = false }
  } else {
    return false                    /* 没写匹配条件 = 永不命中，不猜 */
  }
  if (!hit) return false
  if (rule.ex) {
    /* 排除式写错了就当没写 —— 别让一个笔误把整条规则废掉 */
    try { if (new RegExp(rule.ex).test(t)) return false } catch (e) {}
  }
  return true
}

/* 明显会把页面卡死的正则（嵌套量词 / 超长）。写错了顶多是判不准，卡死的是自己的手机。 */
export function riskyRegex(src) {
  const s = String(src == null ? '' : src)
  return s.length > 200 || /\([^)]*[+*][^)]*\)[+*{]/.test(s)
}

export function ruleTarget(to) {
  if (!to) return null
  if (String(to).indexOf('money') === 0) {
    const i = to.indexOf(':')
    return { kind: 'money', category: i >= 0 ? to.slice(i + 1) : '' }
  }
  if (to === 'todo' || to === 'note' || to === 'inbox') return { kind: to }
  const rt = rtById(to)
  return rt ? { kind: 'rt', rt: rt } : null
}

export function ruleTargetLabel(to) {
  if (!to) return '（没设目标）'
  if (String(to).indexOf('money:') === 0) return '支出 · ' + to.slice(6)
  if (to === 'money') return '支出'
  if (to === 'todo') return '待办'
  if (to === 'note') return '随心记'
  if (to === 'inbox') return '收件箱'
  const rt = rtById(to)
  return rt ? '记录项 · ' + rt.name : '（目标已不存在）'
}

export function ruleMatchLabel(r) {
  let s = '匹配 ' + (r.kw ? '关键词 ' + r.kw : (r.re ? '正则 ' + r.re : '（没写，永不命中）'))
  if (r.ex) s += ' · 排除 ' + r.ex
  if (r.max) s += ' · 只在 ' + r.max + ' 字内判断'
  return s
}

/* 从上往下取第一条命中的。目标要数字而这句里没有数字 → 跳过这条，不硬塞一个 0 进去。 */
export function pickRule(text) {
  const num = firstNumber(text)
  for (const r of db.AUTO_RULES) {
    if (!r.on || !ruleMatches(r, text)) continue
    const tg = ruleTarget(r.to)
    if (!tg) continue
    if (tg.kind === 'rt' && tg.rt.mode === 'number' && num === null) continue
    if (tg.kind === 'money' && num === null) continue
    return r
  }
  return null
}

function buildResolved(raw, tg, rule) {
  const out = { raw, rule, rt: null, kind: 'inbox', value: null, unit: '', text: raw, category: '' }
  if (tg.kind === 'rt') {
    const rt = tg.rt
    out.kind = 'rt'
    out.rt = rt
    if (rt.mode === 'number') {
      const n = firstNumber(raw)
      out.value = n
      out.unit = rt.unit || ''
      out.text = restOf(raw, n)
    }
    return out
  }
  if (tg.kind === 'money') {
    const n = firstNumber(raw)
    out.kind = 'money'
    out.value = n
    out.unit = '元'
    out.text = restOf(raw, n)
    out.category = tg.category || guessCategory(out.text || raw)
    return out
  }
  out.kind = tg.kind
  return out
}

/* mode 是面板上选着的那颗：'auto'，或者 'todo' / 'note' / 'inbox' / 'rt:某条记录项'。
   手动点了类目就**完全跳过自动判断** ——
   「我明明点了餐饮」这件事不能输给一条规则，否则那一点就成了猜测的输入。 */
export function resolveCapture(text, mode) {
  const t = String(text == null ? '' : text).trim()
  const empty = { raw: '', rule: null, rt: null, kind: 'inbox', value: null, unit: '', text: '', category: '' }
  if (!t) return empty
  if (!mode || mode === 'auto') {
    const r = pickRule(t)
    const tg = r ? ruleTarget(r.to) : null
    if (r && tg) return buildResolved(t, tg, r)
    return { raw: t, rule: null, rt: null, kind: 'inbox', value: null, unit: '', text: t, category: '' }
  }
  if (mode.indexOf('rt:') === 0) {
    const rt = rtById(mode.slice(3))
    if (rt) return buildResolved(t, { kind: 'rt', rt: rt }, null)
    return { raw: t, rule: null, rt: null, kind: 'inbox', value: null, unit: '', text: t, category: '' }
  }
  return { raw: t, rule: null, rt: null, kind: mode, value: null, unit: '', text: t, category: '' }
}

/* 那句「会记成：」的话。预览和落库必须是同一个算法算出来的，
   所以两边都从这里过 —— 措辞只在这一处定义。 */
export function describeCapture(r) {
  if (!r) return '收件箱 · 先存着，以后再归类'
  if (r.kind === 'rt') {
    const rt = r.rt
    if (rt.mode === 'number') {
      const n = (r.value === null || r.value === undefined) ? '（没找到数字）' : (r.value + (rt.unit ? ' ' + rt.unit : ''))
      return rt.name + ' ' + n + (r.text ? ' · ' + r.text : '')
    }
    return rt.name + (r.text ? ' · ' + r.text : '')
  }
  /* 「没选分类」这件事只有一种说法：未分类。预览、流水、记账列表说的是同一个事实，
     换个词（'分类待定'）就等于多出一处措辞，将来两处会各说一套。 */
  if (r.kind === 'money') return '支出 ' + (r.value === null ? '' : '¥' + r.value) + ' · ' + (r.category || '未分类')
  if (r.kind === 'todo') return '待办 · 进今天'
  if (r.kind === 'note') return '随心记 · 不进统计'
  return '收件箱 · 先存着，以后再归类'
}

/* 规则的目标下拉。'rt:' 前缀是面板那排胶囊的写法，规则里存的是光秃秃的 id
   —— 存 id 才对：以后它在胶囊排上被挪到哪儿，规则都不用跟着改。 */
export function ruleTargetOptions() {
  const out = [
    { v: 'money', t: '记一笔支出' },
    { v: 'todo', t: '待办' },
    { v: 'note', t: '随心记' },
    { v: 'inbox', t: '只丢进收件箱' }
  ]
  for (const rt of db.RECORD_TYPES) { if (!rt.retired) out.push({ v: rt.id, t: '记录项 · ' + rt.name }) }
  return out
}

/* 保存一条规则，两个去处：新的插到最前（它第一句就能生效，不会被旧规则先抢走），
   改的原地换掉 —— 位置不能动，顺序在这张表里就是要紧的东西。
   sys 跟着原来那条走：改了内置的规则不会因此变成你自己的那条，
   它照样不能删、也不能被挪到你自己那组里去。 */
export function saveRule(rec) {
  const L = db.AUTO_RULES
  const i = L.findIndex(function (r) { return r.id === rec.id })
  if (i < 0) { L.unshift(rec); return 'new' }
  rec.sys = !!L[i].sys
  if (rec.max === undefined && L[i].max !== undefined) rec.max = L[i].max
  L[i] = rec
  return 'edit'
}

/* 内置的不给删，只给关。删除走 deleteNode('rule:xx')，
   和别的条目共用同一套两段确认，所以这里不再单开一个 removeRule()。 */
export function toggleRule(id) {
  const r = db.AUTO_RULES.filter(function (x) { return x.id === id })[0]
  if (!r) return false
  r.on = !r.on
  return r.on
}

/* dir = -1 上移 / 1 下移。不许跨组：跨过去你的规则就压在内置底下了。 */
export function moveRule(id, dir) {
  const L = db.AUTO_RULES
  const i = L.findIndex(function (r) { return r.id === id })
  if (i < 0) return false
  const j = i + dir
  if (j < 0 || j >= L.length) return false
  if (!!L[i].sys !== !!L[j].sys) return false
  const tmp = L[i]
  L[i] = L[j]
  L[j] = tmp
  return true
}

/* 设置页那一行的两个数：生效几条、其中几条是你写的。 */
export function ruleStats() {
  let on = 0, user = 0
  for (const r of db.AUTO_RULES) {
    if (r.on) on++
    if (!r.sys) user++
  }
  return { on: on, total: db.AUTO_RULES.length, user: user }
}

/* 一条规则为什么没被采用。测试框逐条检查时用，和 pickRule 的判断必须同源。 */
export function whyNot(rule, text) {
  if (!rule.on) return '（已关闭）'
  const tg = ruleTarget(rule.to)
  if (!tg) return '（目标已不存在）'
  const num = firstNumber(text)
  if (tg.kind === 'rt' && tg.rt.mode === 'number' && num === null) return '（数值记录项，但这句里没有数字）'
  if (tg.kind === 'money' && num === null) return '（支出，但这句里没有数字）'
  return ''
}

export function newRuleId() { return newId('u') }

/* ---------------- 空间 ---------------- */
export function summaryOf(d, rtCount) {
  let s = todosOf(d.id).length + ' 项待办 · ' + d.habits.length + ' 个习惯 · ' + d.goals.length + ' 个目标'
  if (rtCount > 0) s += ' · ' + rtCount + ' 个记录项'
  return s
}
export function recordTypesOf(list, domainId) {
  /* retired = 已经从界面收起的那几条，不再列出来（它们记过的还在库里） */
  return (list || []).filter(t => t.domain === domainId && !t.retired)
}

/* 记录项的三字段：名称 / 方式 / 单位。方式只有两种（text 纯文字、number 数值），
   不让用户自己设计表单字段 —— 字段一多录入就慢，录入一慢功能就死。
   quick 决定它出不出现在首页速记那一排。 */
export function saveRecordType(rec) {
  const name = String((rec && rec.name) || '').trim()
  if (!name) return { error: '先起个名字' }
  const mode = rec.mode === 'number' ? 'number' : 'text'
  const unit = mode === 'number' ? String(rec.unit || '').trim() : ''
  /* 领域 id 认不出来就是它已经不在了（比如刚被删掉），不能悄悄塞进第一个领域 ——
     那等于把用户的记录放进了一个他没选的地方。 */
  let domain = rec.domain
  if (domain && !domainById(domain)) return { error: '这个领域已经不在了' }
  if (!domain) domain = (db.DOMAINS[0] || {}).id
  if (!domain) return { error: '还没有领域' }
  const dup = recordTypesOf(db.RECORD_TYPES, domain).filter(function (t) {
    return t.name === name && t.id !== rec.id
  })[0]
  if (dup) return { error: '这个领域里已经有「' + name + '」了' }

  const old = rec.id ? rtById(rec.id) : null
  if (old) {
    const from = old.name
    old.name = name
    old.mode = mode
    old.unit = unit
    old.quick = rec.quick !== false
    pushTodayLog('改名', from, '记录项', '记录项改名 · ' + from + ' → ' + name)
    return { rt: old, was: 'edit' }
  }
  const rt = { id: newId('rt'), domain: domain, name: name, mode: mode, unit: unit, quick: rec.quick !== false, logs: [] }
  db.RECORD_TYPES.push(rt)
  return { rt: rt, was: 'new' }
}

/* 移除记录项只从界面收起，**不删它记过的东西** ——
   那些数值还留在库里和导出文件里，将来想恢复或另作他用都还在。
   （真删掉的话，用户手滑点一下就少了一年的体重记录，这种错没法原谅。） */
export function retireRecordType(id) {
  const rt = rtById(id)
  if (!rt) return null
  rt.retired = true
  return rt
}
export function togglePin(id) {
  const d = domainById(id)
  if (!d) return false
  d.pinned = !d.pinned
  return d.pinned
}
/* 重名不拒绝，自动加个序号：「健身」已经有了就叫「健身 2」。
   拒绝会让人以为按钮没反应，而改名这一步在领域页随时能做。 */
export function nextDomainName(base) {
  const has = function (n) { return db.DOMAINS.some(d => d.name === n) }
  if (!has(base)) return base
  let i = 2
  while (has(base + ' ' + i)) i++
  return base + ' ' + i
}

export function newDomain(name) {
  const v = String(name || '').trim()
  if (!v) return { error: '先写个名字' }
  const d = {
    id: 'd' + Date.now().toString(36),
    name: nextDomainName(v),
    pinned: false, habits: [], goals: []
  }
  db.DOMAINS.push(d)
  return { domain: d, name: d.name }
}

export function renameDomain(id, name) {
  const d = domainById(id)
  if (!d) return { error: '这个领域已经不在了' }
  const v = String(name || '').trim()
  if (!v) return { error: '名字不能空' }
  for (const o of db.DOMAINS) {
    if (o.id !== d.id && o.name === v) return { error: '已经有同名领域了' }
  }
  const old = d.name
  d.name = v
  pushTodayLog('改名', old, '领域', '领域改名 · ' + old + ' → ' + v)
  return { name: v, old: old }
}

/* 领域下面一共有多少条内容 —— 删之前要把它说出来，
   不然「删除领域」四个字看着像只删一张卡。
   habits / goals 是**平铺**的（子项靠 parent 指回来），所以数条数就对了。 */
export function domainContentCount(d) {
  if (!d) return 0
  return todosOf(d.id).length + (d.habits || []).length + (d.goals || []).length
}

/* 删掉一个领域 = 拆掉那个入口，不是倒掉里面的东西。
   「分类可以错，数据不该丢」—— 否则人以后就不敢删、也不敢新建。
   所以每一条内容都变成收件箱里的一条等着重新归类（收件箱就是「还没有去处」的那个地方），
   它的记录项则从界面收起（见 retireRecordType），已记的那些留在库和导出文件里。
   打卡历史跟着习惯一起清，和删单条习惯同一套规矩：那串日期已经没有人认得它了。 */
function delDomain(id) {
  const d = domainById(id)
  if (!d) return { error: '这个领域已经不在了' }
  if (db.DOMAINS.length <= 1) return { error: '至少留一个领域' }
  const moved = domainContentCount(d)
  for (const it of todosOf(id)) {
    addInbox(it.title)
    db.ITEMS.splice(db.ITEMS.indexOf(it), 1)
  }
  const release = function (list) {
    for (const x of (list || [])) {
      addInbox(x.t || x.title || '')
      dropHabitLogs(x.id)
      delete db.CLOSED_NODES[x.id]
    }
  }
  release(d.habits)
  release(d.goals)
  for (const rt of recordTypesOf(db.RECORD_TYPES, id)) retireRecordType(rt.id)
  db.DOMAINS.splice(db.DOMAINS.indexOf(d), 1)
  if (db.DOMAIN_ID === id) db.DOMAIN_ID = ''
  return { name: d.name, moved: moved }
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
 * 流水里塞一堆空记录，等于把真正那条冲掉了。
 *
 * 两种行：有 op 的是「某条东西被新建 / 改动 / 删掉了」，没有 op 的只有 label
 * （记下的那一笔、那一条记录）。后一种多数还带着 link —— 那一行连着一条真实数据，
 * 点开就是改它；连着的那条已经不在了，就直说，不假装改得了。
 *
 * id 是给「移除这一行」用的。按数组下标删不行：这一堆是新记录插在头上的，
 * 弹窗开着的时候又记了一笔，下标就指向另一行了。 */
export function pushTodayLog(op, target, detail, label, link) {
  const now = new Date()
  const e = {
    id: newId('tl'),
    time: pad2(now.getHours()) + ':' + pad2(now.getMinutes()),
    op, target, detail, label
  }
  if (link) e.ref = link
  db.TODAY_LOGS.unshift(e)
  return e
}

/* ---------------- 流水行 ↔ 真实数据 ---------------- */
export function logById(id) {
  return db.LOGS.filter(function (x) { return x.kind === 'money' && x.id === id })[0] || null
}

/* 记录项下面那条（体重 71.4 / 热量 1800 / 今天练了什么）。
   它不在 LOGS 里，住在 RECORD_TYPES[].logs 里 —— 两处是两套 id 空间。 */
export function rtLogById(rtId, logId) {
  const rt = rtById(rtId)
  if (!rt) return null
  const entry = (rt.logs || []).filter(function (l) { return l.id === logId })[0]
  return entry ? { rt: rt, entry: entry } : null
}

/* 这一行连着什么：'money:xx' / 'rt:xx|yy'。没连着真实数据的返回 null。 */
export function logRowSpec(e) {
  const r = e && e.ref
  if (!r) return ''
  if (r.k === 'money') return logById(r.id) ? 'money:' + r.id : ''
  if (r.k === 'rt') return rtLogById(r.rtId, r.logId) ? 'rt:' + r.rtId + '|' + r.logId : ''
  return ''
}

/* 今日页那一行被点开。三种落点：连着真实数据（去改它）、
   连着但那条没了（说清楚，别静默）、只是一行流水（只能移除）。 */
export function openLogEdit(e) {
  if (!e) return { error: '这条已经不在了' }
  const spec = logRowSpec(e)
  if (e.ref) {
    if (!spec) return { error: '这条已经不在了' }
    return openEdit(spec)
  }
  return openEdit('tlog:' + e.id)
}

/* 记录项的日期是展示串（'9月18日'），串里没有年份。
   补年份按「不会是未来的日子」来补：今年这个日期还在明天之后，那就是去年记的。 */
export function isoOfCnDate(label, around) {
  const m = /^(\d+)月(\d+)日/.exec(String(label || ''))
  if (!m) return ''
  const base = String(around || TODAY)
  let iso = base.slice(0, 4) + '-' + pad2(Number(m[1])) + '-' + pad2(Number(m[2]))
  if (iso > base) iso = (Number(base.slice(0, 4)) - 1) + iso.slice(4)
  return iso
}
/* 写回去的时候不带星期：新增记录那条路写的就是 '9月18日'，
   改一次日期多出一个星期，等于同一份数据两种格式。 */
export function cnDateOf(iso) {
  const p = String(iso || '').split('-').map(Number)
  if (p.length < 3) return ''
  return p[1] + '月' + p[2] + '日'
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
/* meta 只在弹窗里说「这个字段是什么形态」用（记录项是数值还是文字、带什么单位），
   不是草稿的一部分 —— 提交时不写回任何数据。 */
export const ED = reactive({
  on: false, spec: '', kind: '', title: '', where: '', hint: '', btn: '保存',
  meta: {}, draft: {}
})

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
  if (ED.kind === 'money') {
    return [
      { k: 'value', label: '金额（必填）', type: 'num' },
      { k: 'category', label: '分类', type: 'chips', opts: catOpts() },
      { k: 'date', label: '日期', type: 'date', clearable: false }
    ]
  }
  if (ED.kind === 'rt') {
    const num = ED.meta.mode === 'number'
    return [
      {
        k: 'value',
        label: num ? (ED.meta.name + '，填数字' + (ED.meta.unit ? '（' + ED.meta.unit + '）' : '')) : (ED.meta.name + '（必填）'),
        type: num ? 'num' : 'text'
      },
      { k: 'date', label: '日期', type: 'date', clearable: false }
    ]
  }
  /* 一行流水没有可改的字段：它是「已经发生过什么」，不是「现在是什么」。
     弹窗里那一行只给人看，按钮是移除。 */
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
  const s = String(spec || '')
  const cut = s.indexOf(':')
  const kind = cut < 0 ? s : s.slice(0, cut)
  const key = cut < 0 ? '' : s.slice(cut + 1)
  ED.hint = ''
  ED.btn = '保存'
  ED.meta = {}
  if (kind === 'money') return openMoneyEdit(key)
  if (kind === 'rt') {
    const p = key.split('|')
    return openRtEdit(p[0], p[1])
  }
  if (kind === 'tlog') return openLogRow(key)

  const hit = resolveNode(s)
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

/* 一笔支出能改的就三样：多少钱、算哪类、哪一天。
   没有「备注」—— 记的时候那句原话（'32 午餐'）存进的是分类判断，
   数据里没有备注这个字段，弹窗里凭空多一个框就是骗人。 */
function openMoneyEdit(id) {
  const lg = logById(id)
  if (!lg) return { error: '这笔已经不在了' }
  ED.spec = 'money:' + lg.id
  ED.kind = 'money'
  ED.draft = { value: String(lg.value), category: lg.category || '未分类', date: lg.date }
  ED.title = '修改这笔支出'
  ED.where = fmtCN(lg.date)
  ED.on = true
  return { ok: true }
}

/* 记录项下面那一条。日期存的是 '9月18日' 这种展示串，
   所以进来时换成 ISO 给日期选择器，出去时再换回去。 */
function openRtEdit(rtId, logId) {
  const hit = rtLogById(rtId, logId)
  if (!hit) return { error: '这条已经不在了' }
  ED.spec = 'rt:' + hit.rt.id + '|' + hit.entry.id
  ED.kind = 'rt'
  ED.meta = { mode: hit.rt.mode, unit: hit.rt.unit || '', name: hit.rt.name }
  ED.draft = {
    value: String(hit.entry.v == null ? '' : hit.entry.v),
    date: isoOfCnDate(hit.entry.d, TODAY)
  }
  ED.title = '修改这条记录'
  ED.where = hit.rt.name
  ED.hint = '这是「' + hit.rt.name + '」记下的一条'
  ED.on = true
  return { ok: true }
}

/* 纯流水的那一行：内容只读，按钮是「移除」。
   假装能改一条历史记录，比不让改更糟 —— 那句 hint 就是这件事的说明。 */
function openLogRow(id) {
  const e = db.TODAY_LOGS.filter(function (x) { return x.id === id })[0]
  if (!e) return { error: '这条已经不在了' }
  ED.spec = 'tlog:' + e.id
  ED.kind = 'log'
  ED.draft = { label: rowText(e) }
  ED.title = '这一条'
  ED.where = e.time || ''
  ED.hint = '当天的流水，改不了，只能移除'
  ED.btn = '移除'
  ED.on = true
  return { ok: true }
}

/* 一行流水显示成什么。有 op 的那三种 = 操作对象 + 具体变更；
   记下来的那两种只有 label。措辞只有这一处，今日页和弹窗都读它。 */
export function rowBody(e) {
  if (!e) return ''
  if (e.op) return String(e.target || '') + (e.detail ? ' · ' + e.detail : '')
  return String(e.label || '')
}
export function rowText(e) {
  if (!e) return ''
  return e.op ? e.op + ' ' + rowBody(e) : rowBody(e)
}

export function closeEdit() {
  ED.on = false
  ED.spec = ''
  ED.draft = {}
  ED.meta = {}
  ED.hint = ''
  ED.btn = '保存'
}

export function commitEdit() {
  if (ED.kind === 'money') return commitMoneyEdit()
  if (ED.kind === 'rt') return commitRtEdit()
  if (ED.kind === 'log') return commitLogRemove()

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
  pushTodayLog('修改', target, ch.join('；'), '修改' + kindName + ' · ' + where + ' · ' + target)
  closeEdit()
  return { changed: ch }
}

/* 流水里那句「改了什么」= 逐字段的差异。四种种条目（待办 / 习惯 / 支出 / 记录）
   都用这一种写法，所以比对完直接 ch.join('；') 就行，不用每种再解释一遍。 */
function commitMoneyEdit() {
  const lg = logById(specKey(ED.spec))
  if (!lg) { closeEdit(); return { error: '这笔已经不在了' } }
  const dr = ED.draft
  const val = Number(dr.value)
  if (!(val > 0)) return { error: '金额要大于 0' }
  const nextCat = String(dr.category || '').trim() || '未分类'
  const date = dr.date || lg.date
  const ch = []
  if (Number(lg.value) !== Math.round(val * 100) / 100) ch.push('金额 ' + money(lg.value) + ' → ' + money(val))
  if ((lg.category || '未分类') !== nextCat) ch.push('分类「' + (lg.category || '未分类') + '」→「' + nextCat + '」')
  if (lg.date !== date) ch.push('日期 ' + fmtCN(lg.date) + ' → ' + fmtCN(date))
  if (!ch.length) { closeEdit(); return { unchanged: true } }
  lg.value = Math.round(val * 100) / 100
  /* '未分类' 不落库，落的是空串：显示层本来就把空读成它，存两个字反而多一种表示 */
  lg.category = nextCat === '未分类' ? '' : nextCat
  lg.date = date
  pushTodayLog('修改', '支出 ' + money(lg.value) + ' · ' + (lg.category || '未分类'), ch.join('；'),
    '修改一笔支出')
  closeEdit()
  return { changed: ch }
}

function commitRtEdit() {
  const key = String(ED.spec || '').slice(3)
  const parts = key.split('|')
  const hit = rtLogById(parts[0], parts[1])
  if (!hit) { closeEdit(); return { error: '这条已经不在了' } }
  const dr = ED.draft
  const ch = []
  let vv
  if (hit.rt.mode === 'number') {
    const nv = Number(dr.value)
    if (String(dr.value).trim() === '' || isNaN(nv)) return { error: '这是数值记录，要填个数字' }
    if (Number(hit.entry.v) !== nv) ch.push(hit.rt.name + ' ' + hit.entry.v + ' → ' + nv)
    vv = nv
  } else {
    vv = String(dr.value || '').trim()
    if (!vv) return { error: '内容不能空' }
    if (String(hit.entry.v) !== vv) ch.push(hit.rt.name + '「' + hit.entry.v + '」→「' + vv + '」')
  }
  const oldIso = isoOfCnDate(hit.entry.d, TODAY)
  const date = dr.date || oldIso
  if (date && oldIso && date !== oldIso) ch.push('日期 ' + fmtCN(oldIso) + ' → ' + fmtCN(date))
  if (!ch.length) { closeEdit(); return { unchanged: true } }
  hit.entry.v = vv
  if (date && date !== oldIso) hit.entry.d = cnDateOf(date)
  pushTodayLog('修改', describeCapture({
    kind: 'rt', rt: hit.rt,
    value: hit.rt.mode === 'number' ? Number(hit.entry.v) : null,
    text: hit.rt.mode === 'number' ? '' : String(hit.entry.v)
  }), ch.join('；'), '修改一条记录')
  closeEdit()
  return { changed: ch }
}

/* 移除的是这一行流水本身，不动它当初描述的那条数据。
   所以这里不再往流水里记「移除了一行」—— 那会自己追自己。 */
function commitLogRemove() {
  const id = specKey(ED.spec)
  const e = db.TODAY_LOGS.filter(function (x) { return x.id === id })[0]
  closeEdit()
  if (!e) return { error: '这条已经不在了' }
  db.TODAY_LOGS.splice(db.TODAY_LOGS.indexOf(e), 1)
  return { removed: true }
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
  } else if (kind === 'rule') {
    const r = db.AUTO_RULES.filter(x => x.id === key)[0]
    if (r && r.sys) return { error: '内置的规则删不掉，可以关掉它' }
    if (r) {
      done = { what: '规则', label: ruleName(r) }
      db.AUTO_RULES.splice(db.AUTO_RULES.indexOf(r), 1)
    }
  } else if (kind === 'domain') {
    const r = delDomain(key)
    if (r && r.error) return r
    done = {
      what: '领域', label: r.name,
      /* 收件箱是「还没有去处」的那个地方，删领域不该让任何东西消失 */
      detail: r.moved + ' 条内容已回到收件箱'
    }
  } else if (kind === 'rt') {
    const rt = retireRecordType(key)
    if (!rt) return { error: '这个记录项已经不在了' }
    done = {
      what: '记录项', label: rt.name,
      detail: '已记的 ' + (rt.logs || []).length + ' 条仍留在数据里'
    }
  } else if (kind === 'cat') {
    const r = delCat(key)
    if (r.error) return r
    done = { what: '品类', label: r.name, detail: '已记的 ' + r.used + ' 笔不改' }
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
  /* 删领域 / 删记录项 / 删品类这三样，最要紧的那句是「别的东西没丢」，
     所以把结果一起写进流水，事后能查。 */
  let dt = (done.where ? done.where + ' · ' : '') + done.what
  if (done.detail) dt += ' · ' + done.detail
  pushTodayLog('删除', done.label, dt, '删除' + done.what + ' · ' + done.label)
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
