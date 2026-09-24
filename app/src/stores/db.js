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
import { reactive, ref, watch } from 'vue'
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
/* 宽一档的中文日期：'9 月 17 日 · 周四'。今日页页头用这个。
 *
 * 它以前是 today.vue 里现拼的一串（`p[1] + ' 月 ' + p[2] + ' 日 · 周' + …`）——
 * 和 fmtCN 长得像又不完全一样，读代码的人会以为是同一个函数、改了一个另一个没改。
 * 抽成具名函数之后，「中文日期有两种宽度」这件事就写在脸上了。 */
export function fmtCNWide(iso) {
  const p = String(iso).split('-').map(Number)
  return p[1] + ' 月 ' + p[2] + ' 日 · 周' + weekdayCN(iso)
}
/* 一期从哪天算起。一周以**周一**为头（周日算上一周的末尾）——
   以周日开头的话，「本周」在最常看的那两天里会显得短一截。 */
export function startOfWeek(iso) {
  const p = String(iso).split('-').map(Number)
  const w = new Date(p[0], p[1] - 1, p[2]).getDay()
  return shiftDays(iso, -(w === 0 ? 6 : w - 1))
}
export function startOfMonth(iso) { return String(iso).slice(0, 7) + '-01' }
/* 这个月最后一天。'2026-09-01' → '2026-09-30'。
   new Date(y, m, 0) 里的「0 日」= 上个月最后一天，而 m 是 1 起的月份数，
   所以它正好是「第 m 个月的最后一天」—— 这个写法容易看错，留个记号。 */
export function endOfMonth(iso) {
  const p = String(iso).split('-').map(Number)
  return p[0] + '-' + pad2(p[1]) + '-' + pad2(new Date(p[0], p[1], 0).getDate())
}

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

/* ---------------- 默认值常量 ----------------
 * 放在 db 之前声明：db 的初始值就要用它们，而 const 在初始化之前取不到（TDZ）。
 * 原来这些色表和清单是**在 db 里写一遍、在下面又写一遍**，改一处忘一处就会出现
 * 「清空数据之后四象限配色没回默认」「恢复默认后颜色和初始色不一样」这类问题。 */
export const QUAD_COLOR_DEFAULT = { q1: '#D64545', q2: '#E08E2B', q3: '#3B7DD8', q4: '#8A8F99' }
export const QUAD_KEYS = ['q1', 'q2', 'q3', 'q4']
export const DEFAULT_REV_TRENDS = [{ k: 'money' }, { k: 'rt', id: 'rt_weight' }, { k: 'rt', id: 'rt_kcal_in' }]

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
    /* 打卡按钮「完成态」的颜色（hex），设置页里选（2026-09-23 加）。
       空串 = 用内置的绿。跟着设备走（UI_KEYS），清数据不清它 ——
       清的是记录，不该连外观偏好一起抹掉。 */
    TICK_DONE: '',
    /* 习惯提醒的总开关（2026-09-24 加）。默认**关**。
       跟着设备走（UI_KEYS），**不进 DATA_KEYS**：提醒能不能响取决于
       **这台设备有没有给通知权限**，是设备的事，不是数据的事。
       跟着档案走的话，导入一份别处导出的档案会在新手机上悄悄打开它 ——
       而那台手机可能根本没授权，看着像「开着但不响」。
       默认关的理由：这个应用的气质是「安静地记」，通知是唯一会主动打扰人的东西，
       必须由人自己打开（装完就弹权限申请也是同一件事的反面）。 */
    NOTIFY_ON: false,
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
  CAP_CFG: { order: [], common: {} },
  /* 四象限的四个颜色（hex）。默认那套是 Todoist 的优先级色（P1 红 P2 橙 P3 蓝 P4 灰），
     宇从四组候选里选的。颜色在根节点上以 CSS 变量注入（见 quadVarStyle），
     四象限页的卡片、待办行左缘的色条、编辑弹窗里的 2×2 选择器读的是同一份 ——
     改一个颜色三处一起变。它进 DATA_KEYS：换设备不该重新调一遍颜色。 */
  QUAD_COLORS: deepCopy(QUAD_COLOR_DEFAULT),
  /* 复盘页：看哪一段、以及那一段里盯着哪几项数值。
     REV_MODE / REV_FROM / REV_TO 是「这次打开想看到什么」，切走再切回来不该回到本周，
     所以放在这儿而不是组件里；它们**不进 UI_KEYS** —— 隔一天再打开还停在昨天那个
     自定义区间，看着像数据坏了。
     REV_TRENDS 是花心思挑出来的一份清单，跟着导出文件走（见 DATA_KEYS 那句）。 */
  REV_MODE: 'week',
  REV_FROM: '',
  REV_TO: '',
  REV_TRENDS: deepCopy(DEFAULT_REV_TRENDS)
})

/* 进快照、进导出文件的就是这 15 项。前 13 项和原型的 DATA_VARS 一字不差，
   末尾两项是 uni-app 版新增的界面偏好（原型把这类配置放在设置页里改，没进快照）：
   挑哪几颗胶囊、盯哪几项趋势，都是人一条条调出来的，换设备时不该重来一遍。 */
export const DATA_KEYS = ['ITEMS', 'HABIT_LOGS', 'INBOX', 'NOTES', 'NOTE_PROMPTS', 'LOGS',
  'DOMAINS', 'RECORD_TYPES', 'CAPTURE_MODES', 'AUTO_RULES', 'TODAY_LOGS', 'CAT_WORDS', 'CATS',
  'CAP_CFG', 'REV_TRENDS', 'QUAD_COLORS']

/* 界面状态：跟着设备走。
 *
 * 注意**导出文件里其实是带着它们的**（exportText 把快照整份写出去，s 也在里面）——
 * 但导入时**不采用**：真正决定「当前在哪一页」的始终是本机
 * （importSnapshot 里把 CURRENT 显式还原回去了）。
 * 所以「跟着设备走」是**结果**，不是「没写进文件」——原来那句注释说的是前者、写成了后者。
 * 另外 replaceAll（导入的整体替换）只换 DATA_KEYS，不碰 UI_KEYS 里这些。 */
export const UI_KEYS = ['CURRENT', 'DOMAIN_ID', 'CAPTURE_MODE', 'CAP_AUTO_CLOSE', 'TICK_DONE', 'NOTIFY_ON']

export function loadSeed() {
  const d = deepCopy(SEED_DATA)
  d.ITEMS.forEach(x => { if (x.due) x.due = shiftDays(x.due, SHIFT) })
  d.HABIT_LOGS.forEach(x => { x.date = shiftDays(x.date, SHIFT) })
  d.INBOX.forEach(x => { if (x.at) x.at = shiftDays(x.at, SHIFT) })
  d.NOTES.forEach(x => { if (x.d) x.d = shiftDays(x.d, SHIFT) })
  d.LOGS.forEach(x => { x.date = shiftDays(x.date, SHIFT) })
  d.RECORD_TYPES.forEach(t => (t.logs || []).forEach(l => { l.d = shiftCN(l.d) }))
  DATA_KEYS.forEach(k => { db[k] = d[k] })
  dropHabitIndex()      /* 整份数据换过，打卡索引必须作废（长度可能碰巧相同） */
  ensureIds()
  db.CURRENT = 'today'
  db.DOMAIN_ID = ''
  db.CAPTURE_MODE = 'auto'
  db.CAPTURE_CAT = ''
  db.CLOSED_NODES = deepCopy(SEED_UI.CLOSED_NODES) || {}
  db.CAP_AUTO_CLOSE = true
  /* 提醒总开关不在种子数据里（它是设备偏好，且默认关）——
     不显式给一份的话，换过种子之后它可能留着上一次的值。 */
  db.NOTIFY_ON = false
  db.CAP_CFG = { order: [], common: {} }
  /* 这一项不在种子数据里（它是偏好不是数据），不显式给一份的话
     上面那句 DATA_KEYS.forEach 会把它写成 undefined */
  db.REV_TRENDS = deepCopy(DEFAULT_REV_TRENDS)
  db.REV_MODE = 'week'
  db.REV_FROM = ''
  db.REV_TO = ''
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

/* 导出文件的正文 = 快照 + 一层元信息（什么时候导的、什么格式）。
   **故意不把 at 塞进 snapshot()**：那个每 2 秒跑一次给落盘做去重
   （`snap === LAST_SAVED`），时间戳每次都不同，去重立刻失效、存储被反复写爆。 */
export function exportText() {
  const s = JSON.parse(snapshot())
  return JSON.stringify({ app: 'spine', fmt: 2, at: Date.now(), v: s.v, s: s.s })
}

/* 文件名带日期。同一天导两次会盖掉，但那两次内容本来就一样；隔天导不会混。 */
export function exportFileName() {
  const d = new Date()
  /* 用本文件自己的 pad2，不再就地再写一份等价实现 */
  return '书脊-' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '.json'
}

/* 「这份档案能不能读」只在这一处判断。
   导入和「导入前的预览」共用它 —— 各写一遍迟早分叉，
   出现「预览说可以、真导又说不行」那种自相矛盾。 */
function checkArchive(s) {
  if (!s || typeof s !== 'object') return '不是这个应用导出的文件'
  if (!s.v || typeof s.v !== 'object') return '不是这个应用导出的文件'
  /* 至少要有一样是数组，否则是个空对象，换过去等于把数据清空了还一声不吭 */
  const has = DATA_KEYS.some(function (k) { return Array.isArray(s.v[k]) })
  if (!has) return '这个文件里没有任何数据'
  return ''
}

/* 数一份数据里有多少东西。领域页的习惯 / 计划、记录项下面的日志都藏在里面，
   要一起数进来 —— 不然摘要会少报一大截，让人以为导进来的是个空壳。 */
function countsOf(v) {
  const arr = x => (Array.isArray(x) ? x : [])
  let habits = 0, goals = 0, records = 0
  for (const d of arr(v.DOMAINS)) { habits += arr(d.habits).length; goals += arr(d.goals).length }
  for (const rt of arr(v.RECORD_TYPES)) records += arr(rt.logs).length
  return {
    domains: arr(v.DOMAINS).length,
    items: arr(v.ITEMS).length,
    logs: arr(v.LOGS).length,
    notes: arr(v.NOTES).length,
    inbox: arr(v.INBOX).length,
    cats: arr(v.CATS).length,
    habits: habits,
    goals: goals,
    records: records
  }
}

/* 只看不换。导入前给人一份人话摘要 ——
   一坨 8KB 的 JSON 摆在眼前，谁也看不出这份档案里到底有多少东西。 */
export function peekArchive(raw) {
  let s = null
  try { s = JSON.parse(String(raw || '')) } catch (e) { return { error: '这不是 JSON' } }
  const bad = checkArchive(s)
  if (bad) return { error: bad }
  return { error: '', at: Number(s.at) || 0, counts: countsOf(s.v) }
}

/* 本机现在有多少东西。和上面对照，人才看得出「导进去是变多还是变少」。 */
export function localCounts() { return countsOf(db) }

/* 把一份快照**合并**进本机：档案里有哪一项就覆盖哪一项，没有的保留本机现值。
 *
 * 它服务的是「本机自己的数据」这条路：
 *   loadState()      从 localStorage 读 —— 老版本存的可能天生缺新加的 key
 *   restoreBackup()  从本机备份读 —— 同上
 * 这两处「缺就保留」是必须的：在那里缺项意味着「那一项当时还不存在」，
 * 清掉它反而是数据丢失。**导入不要用它**，导入用 replaceAll（见下）。 */
export function restore(raw) {
  const s = JSON.parse(raw)
  if (s && s.v) DATA_KEYS.forEach(k => { if (s.v[k] !== undefined) db[k] = s.v[k] })
  if (s && s.s) UI_KEYS.forEach(k => { if (s.s[k] !== undefined) db[k] = s.s[k] })
  dropHabitIndex()      /* 整份数据换过，打卡索引必须作废 */
  ensureIds()
}

/* 导入 = 用档案里那份**整体换掉**本机这份：档案里缺哪一项，本机那一项就清空。
 *
 * 为什么是这样：档案是一份完整快照（导出时就是整份写的），缺什么就是没有。
 * 「缺了就保留本机」会让一份残缺档案看起来导入成功了、实际留下两边的混合数据 ——
 * 那是更坏的一种失败，因为人不会发现。**档案的完整性由用户自己负责。**
 *
 * 「整体」的范围 = DATA_KEYS 全部 16 项，与 snapshot() / exportText() 的范围严格一致
 * （不一致的话，导入一份自己刚导出的文件都会丢东西）。
 * **不碰 UI_KEYS**：那是「我在哪一页」，跟着设备走 —— 导入的是数据，不该顺手把人踢走
 * （importSnapshot 另外还把 CURRENT 显式还原了一次，见那里的说明）。
 *
 * 和 restore 分成两个函数（而不是加一个布尔参数）是有意的：
 * 这两种语义的差别是「漏一项就丢数据」级别的，藏在参数里迟早被误用。
 * 但两者共用 DATA_KEYS 这一份清单，范围不会分叉。 */
export function replaceAll(archive) {
  const v = (archive && archive.v) || {}
  /* 先把 16 项的新值全算出来，再一次性赋值：算的过程中抛错也不会留下
     「换了一半」的中间状态（屏幕上看着新、存储里是旧的那种最坏失败）。 */
  const next = {}
  for (const k of DATA_KEYS) {
    const mk = EMPTY_VALUE_OF[k]
    const empty = mk ? mk() : (Array.isArray(db[k]) ? [] : {})
    const given = Object.prototype.hasOwnProperty.call(v, k) && v[k] !== undefined
    /* 以「空值的形态」为基准：档案给的值形态对得上才用，对不上当空 —— 不然一个
       `ITEMS: null` 会让赋值之后的补 id 那一步抛错，留下「数据换了、id 没补」的半死状态。
       注意这只挡**形态非法**，不挡**缺项**：缺项就是清空，那是导入该有的语义。 */
    if (!given) { next[k] = empty; continue }
    const val = v[k]
    next[k] = Array.isArray(empty)
      ? (Array.isArray(val) ? val : [])
      : (val && typeof val === 'object' && !Array.isArray(val) ? val : {})
  }
  for (const k of DATA_KEYS) db[k] = next[k]
  dropHabitIndex()      /* 整份数据换过，打卡索引必须作废 */
  ensureIds()
}

/* 导入 = 用文件里那份整体换掉本机这份。先把文本验一遍再换：
   换到一半才报错是最坏的一种失败 —— 屏幕上看着是新数据，存储里却是旧的。
   返回空串 = 成功；否则返回一句人话，给界面直接显示。 */
export function importSnapshot(raw) {
  let s = null
  try { s = JSON.parse(String(raw || '')) } catch (e) { return '这不是 JSON' }
  const bad = checkArchive(s)
  if (bad) return bad
  /* 导入的是数据，不该顺手把人从当前这一页踢走（领域页除外：那个领域可能不在了） */
  const back = db.CURRENT === 'domain' ? 'spaces' : db.CURRENT
  /* 换之前先把本机现状留一份备份。导入是单向的破坏动作，和「恢复」一样该能反悔 ——
     而自动备份是「每天第一份」，未必覆盖得住此刻的最新改动。 */
  keepBackupAs(TODAY + ' 导入前')
  try {
    replaceAll(s)
  } catch (e) { return '文件内容读不出来' }
  db.CURRENT = back
  saveState(true)
  return ''
}

/* ---------------- 清空数据 ----------------
 * 清成**空的**，不是清成种子：种子里那几条是示例，「清空」之后又长回来，
 * 人会以为没清掉。loadState 那边的规矩是「存储里有东西就恢复、没有才种种子」，
 * 所以清完立刻 saveState(true) 把这份空写进去 —— 下次打开还是空的，不会自己长回来。
 *
 * 领域也一起清。空间页在没有领域时会显示空态、能新建，不会白屏。
 * 界面状态（CURRENT / DOMAIN_ID …）不在这里动：清数据不该把人踢到别的页面去。
 * 四象限配色也回到默认 —— 它也算数据，而且跟着导出文件走。
 */
/* 「清成空」每一项长什么样。清单**从 DATA_KEYS 派生**，不再手抄一份 ——
   手抄的代价是「往 DATA_KEYS 里加了新字段、忘了加进那份清单」，后果是那个字段
   清不掉，而「清空数据」是个不可逆操作，静默失败最难发现。
   （原来这里内联了 13 项，另外 3 项分散在下面几行单独赋值。） */
const EMPTY_VALUE_OF = {
  CAT_WORDS: function () { return {} },
  CAP_CFG: function () { return { order: [], common: {} } },
  REV_TRENDS: function () { return [] },
  QUAD_COLORS: function () { return {} }
}
export function clearAllData() {
  for (const k of DATA_KEYS) {
    const mk = EMPTY_VALUE_OF[k]
    if (mk) { db[k] = mk(); continue }
    db[k] = Array.isArray(db[k]) ? [] : {}
  }
  db.CLOSED_NODES = {}
  dropHabitIndex()
  saveState(true)
  return { ok: true }
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
/* 自上次存盘以来是否有改动。
 *
 * 为什么需要它：saveState 每 2 秒被叫一次，而它原来的第一件事是把**整份数据**
 * 序列化成字符串、再和上一份做字符串全文比较。实测数据量上来之后这一步要 53ms
 * —— 优化（不变就不写）发生在付代价**之后**，静态时也照烧不误，
 * 常驻约 2.7% 的 CPU 外加一次 300KB 级字符串的分配。
 *
 * 现在改成先看这个标记，没改就直接返回，序列化那一步根本不走。
 * 标记由一个深度 watcher 置位：它只在真的发生变更时才跑一趟遍历，
 * 静态时一次都不跑。
 *
 * flush 用默认的**异步**：批量写入（载入种子、导入档案、给老档案补 id）
 * 会连发成百上千次变更，同步 flush 会把整份数据遍历成百上千遍；
 * 异步只是合并到下一拍跑一次。
 * 代价（已评估）：非 force 的 saveState 调用如果紧跟在变更之后、且 watcher
 * 还没跑，这次会跳过 —— 最坏情况下由 2 秒的兜盘定时器和退后台时的
 * saveState(true) 兜住。这是「每 2 秒兜一次盘」这个既有设计本来就接受的窗口。 */
let DIRTY = true
watch(db, function () { DIRTY = true })

/* 存不下的时候要有人管。用户以为存住了、其实没存，是这个应用最不能出的一种错 ——
   所以这里不是一个 console.error 就算了，UI 会读这个标志把实情显示出来。 */
export const storeFailed = ref(false)
/* 最后一次存成功的时刻。页头那行「已保存 HH:MM」读的就是它。
   存储状态必须一直看得见 —— 埋在设置里的话，人会默认它就是存上了，
   而「以为记下了其实没记」是这个应用最不能出的一种错。 */
export const lastSavedAt = ref(0)

/* 页头那句话。存失败时如实说，平时给时刻 ——
   时刻比「已保存」三个字有用：一眼能看出是刚才存的那次。 */
export function saveStateText() {
  if (storeFailed.value) return { bad: true, text: '存储失败' }
  if (!lastSavedAt.value) return { bad: false, text: '' }
  const d = new Date(lastSavedAt.value)
  return { bad: false, text: '已保存 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) }
}

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
  /* 没改动就直接返回 —— 判断在序列化之前（见上面 DIRTY 那段）。 */
  if (!force && !DIRTY) return
  const snap = snapshot()
  /* 改过、但内容又变回原样（比如拖了滑杆再拖回来）：这一趟白算了，但别白写盘 */
  if (!force && snap === LAST_SAVED) { DIRTY = false; return }
  try {
    uni.setStorageSync(LS_KEY, snap)
    LAST_SAVED = snap
    DIRTY = false
    storeFailed.value = false
    lastSavedAt.value = Date.now()
  } catch (e) {
    storeFailed.value = true
    return
  }
  /* 存**成功**了才留快照：失败时留的会是旧数据，
     反悔回去反到的是错的那份 —— 那比没有备份更糟。 */
  try { autoBackup() } catch (e) {}
}

/* ---------------- 自动备份 ----------------
 * research-02 防守策略第 3 条：上线前必须有自动备份（反时光序数据丢失的教训）。
 * 做法：**每天第一次保存**时留一份全量快照，本地留最近 7 份。
 * 一份大概 8KB，7 份 56KB，本机存储给得起。
 * 清空数据**不清**备份 —— 清空恰恰是最需要能反悔的时刻。
 * 只有 saveState 调它：它是「存」这个动作的附属品，不该有别处来叫。
 */
const LS_BACKUP = 'spine-backups'
const BACKUP_KEEP = 7

function readBackups() {
  let list = []
  try { list = JSON.parse(uni.getStorageSync(LS_BACKUP) || '[]') } catch (e) { list = [] }
  if (!Array.isArray(list)) return []
  return list
}
function writeBackups(list) {
  try { uni.setStorageSync(LS_BACKUP, JSON.stringify(list)) } catch (e) {}
}

export function autoBackup() {
  const list = readBackups()
  if (list.length && list[0].date === TODAY) return false
  list.unshift({ date: TODAY, at: Date.now(), counts: localCounts(), raw: snapshot() })
  writeBackups(list.slice(0, BACKUP_KEEP))
  return true
}

/* 给设置页看的清单。不带 raw —— 那是几 KB 的 JSON，塞进响应式里没有意义 */
export function backupList() {
  return readBackups().map(function (b) {
    return { date: b.date, at: b.at, counts: b.counts }
  })
}

/* 把**现在这份**留成一份备份。返回写入后的清单。
 *
 * 抽出来是因为有两个调用方，而这两个都是单向的破坏动作：
 *   恢复（restoreBackup）把本机换成某天旧的样子；
 *   导入（importSnapshot）把本机换成档案里那份。
 * 两处都该能反悔，不然「恢复」和「导入」就是两个不能回头的按钮。
 * 抽成一份还有个好处：「只留最近 7 份」这条规则只写一次。 */
function keepBackupAs(date) {
  const list = readBackups()
  list.unshift({ date: date, at: Date.now(), counts: localCounts(), raw: snapshot() })
  const kept = list.slice(0, BACKUP_KEEP)
  writeBackups(kept)
  return kept
}

/* 恢复到某一天。**恢复前先把现在这份也留成备份** ——
   恢复这件事本身应该可以反悔，不然「恢复」就成了另一个单向的破坏动作。 */
export function restoreBackup(date) {
  const hit = readBackups().filter(function (x) { return x.date === date })[0]
  if (!hit) return { error: '那份备份已经不在了' }
  keepBackupAs(TODAY + ' 恢复前')
  /* 上面那一存可能把最老的一份挤出 7 份之外 —— 目标恰好是那一份的话，
     它现在已经没了。所以重新读一遍再确认，别拿着一个已经不存在的引用去恢复。 */
  const again = readBackups().filter(function (x) { return x.date === date })[0]
  if (!again) return { error: '那份备份已经不在了' }
  try { restore(again.raw) } catch (e) { return { error: '那份备份读不出来' } }
  saveState(true)
  return { ok: true }
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

/* 今日页要显示的待办。分**三**组，不是两组：
   overdue = 逾期没做的，due = 今天到期的，done = 今天做完的。

   为什么单分一组 done：勾选框要能反悔。勾完那一行要是直接从列表消失，
   就再没有东西可点了。所以今天做完的留在专门的一处 ——
   不是混在待办里（那会让「还剩几件」看不清），是块头那个「已完成」按钮切过去看。
   逾期那一组不留已完成的：那些是欠账，清掉就该走。 */
export function pickToday(items, today) {
  const t = today || TODAY, over = [], due = [], done = []
  for (const it of (items || [])) {
    if (!it.due) continue
    if (it.status === 'done') {
      if (it.due === t) done.push(it)
      continue
    }
    if (it.due < t) over.push(it)
    else if (it.due === t) due.push(it)
  }
  over.sort((a, b) => (a.due < b.due ? -1 : (a.due > b.due ? 1 : 0)))
  return { overdue: over, due: due, done: done }
}

/* ---------------- 打卡 ----------------
 * 打卡记录的一次性索引：习惯 id → { dates: 升序去重, set: O(1) 查某天 }。
 *
 * 为什么要有它：这一份记录被问得极其频繁 —— 一个习惯行的「连续/累计」要问一次、
 * 「今天打没打卡」要问一次，而今日页/领域页的模板里各自还要重复问好几遍。
 * 不建索引的话每次都要扫全表 HABIT_LOGS 再排序：106 个习惯、每行 5 次调用
 * 实测 1.2 秒（一个页面）。建索引之后是「整趟构建一次 + 每次只看该习惯那几天」。
 *
 * 失效：**长度变了就重建**（本应用里增删打卡都会改长度）。但整体换数据的地方
 * （loadSeed / restore / clearAllData）长度可能碰巧相同，所以那几处显式
 * dropHabitIndex()，不能只靠长度判断 —— 否则会拿旧表算。 */
const EMPTY_DATES = []
const EMPTY_COUNT = {}
let HABIT_IDX = null, HABIT_IDX_LEN = -1
function dropHabitIndex() { HABIT_IDX = null; HABIT_IDX_LEN = -1 }
function habitIndex() {
  const L = db.HABIT_LOGS || []
  if (HABIT_IDX && HABIT_IDX_LEN === L.length) return HABIT_IDX
  const acc = {}
  for (const h of L) {
    if (!h) continue
    /* 空日期（''）也照收，不跳过 —— 旧实现就是把它当成一个「天」算进累计的。
       这里不是「顺手修个脏数据」的地方：改了会让老档案的「累计 N 天」当场变小，
       而用户没有任何办法知道为什么。行为一致性优先。 */
    const e = acc[h.key] || (acc[h.key] = { set: new Set(), count: {} })
    e.set.add(h.date)
    /* 一条记录是「这一天完成了几次」：{key,date} 是 1 次（老档案都没有 n 字段），
       {key,date,n:3} 是 3 次。**同一天永远只有一条**，再打卡是改 n 不是加条目 ——
       「一条 = 一天」这个约定不能破，不然全项目好几处「遍历打卡记录、一条算一天」
       的统计会悄悄变成按次数算，而且没人会发现。 */
    e.count[h.date] = (e.count[h.date] || 0) + (Number(h.n) || 1)
  }
  const out = {}
  for (const k in acc) out[k] = { dates: Array.from(acc[k].set).sort(), set: acc[k].set, count: acc[k].count }
  HABIT_IDX = out
  HABIT_IDX_LEN = L.length
  return out
}
function datesOf(id) { const e = habitIndex()[id]; return e ? e.dates : EMPTY_DATES }

/* 返回的是副本：调用方一直可以随便改（原来也是每次现建一个数组）。
   date 省略 = **今天** —— 理由见下面 habitCountOn 那段。 */
export function habitDoneOn(id, date = TODAY) {
  const e = habitIndex()[id]
  return !!(e && e.set.has(date))
}
/* 某一天打了几次。0 = 这天没打过。老档案没有 n 字段，一条就是 1 次。
   **date 省略 = 今天**，不是「随便哪天」。这个默认值是必须的：
   少了它就是 `count[undefined]` → 0，而 0 在调用方读起来是「今天还没打卡」——
   一个不报错的错答案。TreeList 的长按撤销正是这么栽的（见那边 hold() 的注释）：
   漏传日期 → 永远走「今天还没有打卡记录」分支，撤销一次都没生效过，
   而对拍抓不到它，因为错的是调用方、不是数据层。 */
export function habitCountOn(id, date = TODAY) {
  const e = habitIndex()[id]
  return (e && e.count[date]) || 0
}
/* 区间里累计打了多少**次** —— 注意不是天数，一天可以打好几次。
   本期进度（「本周 2/4」）用的就是它。 */
export function habitCountInRange(id, from, to) {
  const e = habitIndex()[id]
  if (!e) return 0
  let n = 0
  for (const d in e.count) { if (d >= from && d <= to) n += e.count[d] }
  return n
}
/* 某一个区间里打过几天卡。复盘那张表要的就是这个数 ——
   它和「累计」不是一回事：累计是全时段，这个只看这一期。 */
export function habitDaysInRange(id, from, to) {
  let n = 0
  for (const d of datesOf(id)) { if (d >= from && d <= to) n++ }
  return n
}

/* 连续打卡天数：从今天往回数，遇到第一个没打卡的日子就停。
   今天还没打卡**不算断** —— 这一天还没过完，早上打开一眼就被判「断了」太伤人。
   所以：今天有卡就从今天起数，今天没有就从昨天起数。 */
/* 一个习惯按什么单位算连续/累计：频率带「每周」就按周，带「每月」就按月，
   其余（每天、自定义文案）按天。看字面就够了 —— 频率现在是滚轮选的，
   写法固定，不会出现「一周三次」这种要猜的写法。 */
export function habitUnit(m) {
  const s = String(m || '')
  if (s.indexOf('每月') >= 0) return 'month'
  if (s.indexOf('每周') >= 0) return 'week'
  return 'day'
}

/* 频率 = 单位 × 次数，两个滚轮选。存进 m 的仍然是显示的那句话，
   打卡统计（habitUnit）和导出都不用跟着改。
   解析不出来的（老数据手填的「工作日」之类）返回 null —— 界面保持原样，
   用户不动滚轮就不改写它，不会悄悄把手填的词冲掉。 */
export const FREQ_UNITS = ['每日', '每周', '每月']
export function parseFreq(m) {
  const hit = /^每(天|日|周|月)\s*(\d+)?\s*次?$/.exec(String(m || '').trim())
  if (!hit) return null
  return { unit: hit[1] === '周' ? '每周' : hit[1] === '月' ? '每月' : '每日', n: hit[2] ? Number(hit[2]) : 1 }
}
export function freqText(unit, n) {
  if (n === 1) return unit === '每日' ? '每天' : unit
  return unit + ' ' + n + ' 次'
}

/* 一个打卡日期落在哪个期。周口径和全应用一致：周一为头；
   月口径用 YYYY-MM（字符串就能比大小、也能当下一个/上一个的键）。 */
function periodKey(iso, unit) {
  if (unit === 'week') return startOfWeek(iso)
  if (unit === 'month') return String(iso).slice(0, 7)
  return iso
}

function prevPeriodKey(key, unit) {
  if (unit === 'week') return shiftDays(key, -7)
  if (unit === 'month') {
    const p = key.split('-').map(Number)
    const d = new Date(p[0], p[1] - 2, 1)
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1)
  }
  return shiftDays(key, -1)
}

/* 一个习惯的「期 → 有打卡」表。索引只有那一份，单位只决定怎么折算成期。
   连续和累计都从这一张表算 —— 原来这两个函数各自建一遍同样的表，
   于是 habitStat 里那两行代码跑了两遍全量扫描。 */
function periodsOf(id, unit) {
  const has = {}
  for (const d of datesOf(id)) has[periodKey(d, unit)] = 1
  return has
}
/* 从 has 往回数连续期数。今天还没打卡**不算断**（这一天还没过完）。 */
function streakOfHas(has, unit, today) {
  let k = periodKey(today || TODAY, unit)
  if (!has[k]) k = prevPeriodKey(k, unit)
  let n = 0
  const cap = unit === 'day' ? 3660 : 600   /* 十年 / 五十年封顶，防数据坏了转不出来 */
  while (has[k] && n < cap) { n++; k = prevPeriodKey(k, unit) }
  return n
}

/* 「连续 N 天 · 累计 M 天」这句**只在这里说一次**。
 * 两个容易说错的地方，都是原型判过的：
 *   · 一次都没打过（total 0）→ 整句不显示。说「还没打卡」是错的：
 *     一个累计四十天、这周断了的人，也被那句话描述成了「从没开始过」。
 *   · 断了要说「连续 0 天」，不改词。换一句说法就等于换了一套算法。
 * on 只管要不要加重（连着的那几天值得亮一下），不影响数字。
 * 单位跟频率走：每周几次的说「连续 N 周」，每月的说「连续 N 个月」。
 * 一周里只要打过一次那周就算数 —— 不按「每周 N 次」的次数卡达标，
 * 卡达标的话每周头几天永远显示「断了」，比真断了还劝退。 */
const UNIT_WORD = { day: '天', week: '周', month: '个月' }
/* node 是可选的：调用方手上已经有习惯对象时（今日页/领域页的行对象）
   直接传进来，省掉一次 habitById —— 它要扫遍所有领域桶。 */
function streakLine(node, id, today) {
  const m = node || habitById(id)
  const unit = habitUnit(m ? m.m : '')
  const has = periodsOf(id, unit)
  const total = Object.keys(has).length
  if (!total) return null
  const cur = streakOfHas(has, unit, today)
  const u = UNIT_WORD[unit] || '天'
  return { s: '连续 ' + cur + ' ' + u + ' · 累计 ' + total + ' ' + u, on: cur > 0 }
}
export function streakText(id, today) { return streakLine(null, id, today) }
export function streakTextOf(node, today) { return node ? streakLine(node, node.id, today) : null }

/* 习惯行上那几个随行字段：连续/累计那句、今天打没打卡、
 * 以及多次打卡的进度（今天几次 / 本期几次 / 本期目标是几次）。
 * **一处定义** —— 今日页（crossTree）和领域页（domain.vue）都从这里取。
 * 两处各拼一遍的话，哪天改了一处，另一页就会不一致。
 *
 * target 永远 ≥ 1：m 解析不出来（写坏了）就按「每天 1 次」算，
 * 那种行的按钮还是老样子，不会因为一句写坏的频率把按钮显示弄没。 */
export function habitRowExtra(node, today) {
  const t = today || TODAY
  const id = node ? node.id : ''
  const pf = node ? parseFreq(node.m) : null
  const unit = habitUnit(node ? node.m : '')
  const target = pf ? pf.n : 1
  /* 本期起点：天 = 今天；周 = 周一（和全应用的周口径一致）；月 = 本月 1 日。 */
  const from = unit === 'week' ? startOfWeek(t) : unit === 'month' ? startOfMonth(t) : t
  return {
    streak: streakTextOf(node, t),
    doneToday: habitDoneOn(id, t),
    todayCount: habitCountOn(id, t),
    periodCount: habitCountInRange(id, from, t),
    target: target,
    unit: unit
  }
}

/* 打卡 +1 / 撤销一次 −1。返回这次操作之后**当天**的次数（0 = 已经没有记录）。
 *
 * 「多次」存在可选的 n 字段上：{key,date} 就是 1 次，{key,date,n:3} 是 3 次 ——
 * 老档案没有 n，读出来还是 1 次，导出格式（fmt:2）一个字没变；
 * 只有 >1 次的条目才带 n，所以老档案导出去也是原样。
 *
 * 减到 0 就把这条删掉：不存在「打了 0 次」的记录 —— 留着它，
 * 「打过没有」（set）和「打了几次」（count）两套口径就会分家。
 *
 * **必须显式作废索引**：habitIndex 的失效判断是「长度变了就重建」，
 * 而改 n 恰恰长度不变 —— 不作废的话，下一次读到的还是旧表。 */
export function bumpHabitLog(id, delta, date) {
  const d = date || TODAY
  const step = delta < 0 ? -1 : 1
  for (let i = 0; i < db.HABIT_LOGS.length; i++) {
    const h = db.HABIT_LOGS[i]
    if (h.key !== id || h.date !== d) continue
    const n = (Number(h.n) || 1) + step
    if (n <= 0) db.HABIT_LOGS.splice(i, 1)
    else if (n === 1) delete h.n     /* 回到 1 次就把 n 摘掉 —— 条目回到老档案的样子，
                                        撤销完再导出，文件跟从没多次打过一样 */
    else h.n = n
    dropHabitIndex()
    return n > 0 ? n : 0
  }
  if (step < 0) return 0        /* 本来就没打过，撤销无事发生 */
  db.HABIT_LOGS.push({ key: id, date: d })    /* 1 次不写 n，跟老格式一致 */
  dropHabitIndex()
  return 1
}

/* 全有或全无的打卡：没打过就记 1 次，打过就整条删掉（不管 n 是几）。
 * 页面已改用 bumpHabitLog（那才能「撤销一次」而不是「撤销这一天」）；
 * 这个保留是因为它是导出接口、等价性对拍还覆盖着。 */
export function toggleHabitLog(id, date) {
  const d = date || TODAY
  for (let i = 0; i < db.HABIT_LOGS.length; i++) {
    const h = db.HABIT_LOGS[i]
    if (h.key === id && h.date === d) { db.HABIT_LOGS.splice(i, 1); return false }
  }
  db.HABIT_LOGS.push({ key: id, date: d })
  return true
}

/* ---------------- 习惯提醒 ----------------
 * 提醒时间存在习惯对象上的**可选字段 `rm`**（'HH:MM'，缺失 = 不提醒）。
 * 和 `n` 一样属于「给既有条目加一个可选字段」：老档案没有 `rm`，读出来就是
 * 「这个习惯不提醒」—— 语义不变，`fmt:2` 不用动，老档案导出去一个字节都不多。
 *
 * **为什么不进 DATA_KEYS 单开一张表**：提醒是习惯自己的一个属性，
 * 拆成独立表就得处理「习惯删了、提醒还在」这种孤儿状态（全项目已经有一条
 * 同类的教训：打卡记录是独立表，删习惯要记得 dropHabitLogs）。
 * 挂在对象上，删除习惯时它自然跟着走。
 *
 * 提醒的**开关**在 db.NOTIFY_ON（UI_KEYS，跟设备走），不在字段里 ——
 * 见 db 那段注释：能不能响是设备权限的事，和「这个习惯想不想被提醒」是两回事。 */

/* 时间串的规范形：'HH:MM'，24 小时制、两位补零。
   不规范的一律当「没设」—— 宁可这条不提醒，也不要拿一个解析不出的时间
   去算下一次触发（算出来的是错的时刻，比不响更难查）。 */
const RM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
export function remindTimeOf(node) {
  const v = node ? String(node.rm || '') : ''
  return RM_RE.test(v) ? v : ''
}
/* 设/清一个习惯的提醒时间。传空 = 不提醒（把字段摘掉，条目回到老档案的样子）。 */
export function setHabitRemind(id, hhmm) {
  const h = habitById(id)
  if (!h) return { error: '这个习惯已经不在了' }
  const v = String(hhmm || '').trim()
  if (!v) { delete h.rm; return { ok: true, rm: '' } }
  if (!RM_RE.test(v)) return { error: '时间要写成 HH:MM（比如 08:30）' }
  h.rm = v
  return { ok: true, rm: v }
}

/* 未来一段日子里，该响的那几颗通知。**纯函数**（除了读 db），
   算出来的东西直接交给原生层排 —— 这样「哪天该响」这件事可以被对拍钉住，
   而不用真机装一遍才知道。
 *
 * 为什么是「预排未来 N 天的定点通知」而不是让原生做「每天重复」：
 * 插件的 `repeats: true` 拿 `at - now` 当**固定间隔**，跨过夏令时/月份长度
 * 都会漂（今天 08:00 排的，一个月后可能变成 07:59）；`every: 'day'` 同病。
 * 定点排一批、每次打开重排，行为是完全可预测的：
 *   ① 到点响不响只取决于那一刻有没有这条通知，没有别的时间算术在跑；
 *   ② 「今天已经打过卡了就别再响」这种条件能实现 —— 重复型给不了这个。
 *
 * 跳过规则（按顺序）：
 *   · 时间串不合法 → 跳过（见 RM_RE 那段）
 *   · 这一时刻已经过去 → 跳过（原生也不接受过去的时刻，会静默丢弃）
 *   · 频率单位是「天」且那天**已经打过卡** → 跳过。
 *     只对天口径做这件事：周/月口径的「达标」是按整期算的，
 *     这周打过两次不代表今天这一次不用做，替用户跳过反而是错的。
 *
 * @param days 往前看几天（默认 7）。只排 7 天是因为再远没有意义 ——
 *   原生那边有数量上限，而这个应用本来就每天都会打开。
 * @param nowMs 现在（毫秒）。显式传进来是为了冻结时钟能测。
 * @returns [{ id, key, at(毫秒), date, time, title }]，按时间升序。
 */
export function remindPlan(days, nowMs) {
  const n = Number(days) > 0 ? Math.floor(Number(days)) : 7
  const now = Number(nowMs) || Date.now()
  const out = []
  /* 一趟把「哪天要提醒」收齐，不要去循环里调 habitById（那是按签名 O(n) 的） */
  for (const d of db.DOMAINS) {
    for (const h of (d.habits || [])) {
      const t = remindTimeOf(h)
      if (!t) continue
      /* 天口径的习惯：那天打过卡就不排。用 habitDoneOn（O(1) 查索引），
         不是每行扫一遍 HABIT_LOGS。 */
      const daily = habitUnit(h.m) === 'day'
      for (let i = 0; i < n; i++) {
        const date = shiftDays(TODAY, i)
        const at = atOf(date, t)
        if (!(at > now)) continue
        if (daily && habitDoneOn(h.id, date)) continue
        out.push({ id: 0, key: h.id, at: at, date: date, time: t, title: labelOf(h) })
      }
    }
  }
  out.sort(function (a, b) { return a.at - b.at })
  /* 通知 id 必须是 32 位正整数且**稳定**：同一颗通知每次重排要落在同一个 id 上，
     否则旧的取消不掉、到点会响两遍。
     用「日期 + 时间 + 习惯 id 的哈希」拼成一个正整数，同一天同一习惯永远同一个 id。 */
  const used = {}
  for (const o of out) {
    let id = notifyIdOf(o.date, o.time, o.key)
    while (used[id]) id = id === 2147483647 ? 1 : id + 1   /* 撞了就顺延，避开 0 */
    used[id] = true
    o.id = id
  }
  return out
}

/* 'YYYY-MM-DD' + 'HH:MM' → 毫秒。**按本机时区**算（new Date(y, m, d, hh, mm)），
   不用 Date.parse('T…Z') —— 那样得到的是 UTC，会差出一个时区。 */
function atOf(date, hhmm) {
  const y = Number(date.slice(0, 4)), mo = Number(date.slice(5, 7)), da = Number(date.slice(8, 10))
  const hh = Number(hhmm.slice(0, 2)), mi = Number(hhmm.slice(3, 5))
  return new Date(y, mo - 1, da, hh, mi, 0, 0).getTime()
}
export function remindAtOf(date, hhmm) { return atOf(date, hhmm) }

/* 通知 id：把三个串揉成一个 31 位正整数。要求只有两个 ——
   · 同样的输入永远得到同样的 id（重排要能盖掉上一次那颗）
   · 不同的输入**基本**不撞（撞了由 remindPlan 里的顺延兜住）
   所以用一个简单的 31 位 FNV 变体就够了，不需要密码学强度。 */
function notifyIdOf(date, time, key) {
  const s = date + 'T' + time + '#' + key
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return (h % 2147483646) + 1
}
export function remindIdOf(date, time, key) { return notifyIdOf(date, time, key) }

/* 设不设提醒、以及有哪些习惯设了（设置页和今日页要看这个数）。 */
export function remindStats() {
  let on = 0
  for (const d of db.DOMAINS) for (const h of (d.habits || [])) if (remindTimeOf(h)) on++
  return { on: on }
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
  /* 换页回到顶部。视图是 v-show 切换的，滚动位置会原样留着 ——
     上一个页面滚到 800px、切过来还停在 800px，
     看起来像「这个页面少了东西」，而不是「我上次看到这儿」。
     duration 0 是瞬时的：切页本来就该直接落在头上，动画只会让人等着。 */
  try { uni.pageScrollTo({ scrollTop: 0, duration: 0 }) } catch (e) {}
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

/* 记账那个「记下」框的提交，抽到数据层：记账页上有一个框、品类弹层里还有一个，
   两处各写一份的话，迟早有一天一句话在两处解成两个金额 ——
   那是这台设备上最难查的一种错。返回 { rec } 或 { error }。 */
export function commitMoneyText(t) {
  const text = String(t || '').trim()
  if (!text) return { error: '先写一句' }
  const r = resolveCapture(text, 'auto')
  if (r.kind !== 'money' || r.value === null) return { error: '这里只记支出，金额写在开头' }
  const rec = addMoney(r.value, r.text, r.category)
  if (!rec) return { error: '金额不对' }
  return { rec: rec }
}

export function addTodo(title, domId, due) {
  const t = String(title || '').trim()
  if (!t) return null
  const rec = {
    id: newId('it'), title: t,
    dom: domainById(domId) ? domId : null,
    due: due === undefined ? TODAY : (due || null),
    status: 'todo', parent: null,
    /* 四象限两个轴。**新条目不预设**（都落「都不」那一格）——
       预设了等于替人判断「这事重要/紧急」，而那种猜错比空着更难发现：
       格子看着是满的，其实全是机器分的。见下面 quadOf 那段。 */
    imp: false, urg: false
  }
  db.ITEMS.unshift(rec)
  return rec
}

/* ---------------- 重复待办 ----------------
 * 完成一条带 repeat 的待办时，把下一次也建好。
 * 用「新建一条」而不是「把这条的到期日往后推」—— 推日期的话，
 * 做完的那一次就没有了，复盘里「这一周完成了几条」会越算越少，
 * 而「已完成」那一栏也再没有东西可以反悔。
 *
 * 只有**顶层**会滚。子项跟着父项走（到期日/领域都是继承的），
 * 子项做完就做完了，再长一条出来只会让树上多出一个孤儿。
 * 月/年的「同一天」在该月不存在时（1/31 → 2 月）收到那个月最后一天，
 * 不然 Date 自己会把它滚到下个月头上去，日历上就跳了一个月。
 */
const REPEAT_STEP = { daily: 1, weekly: 7 }

export function repeatName(k) {
  return { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }[k] || ''
}

export function rollRepeat(it) {
  if (!it || !it.repeat || !it.due || it.parent) return null
  let next = ''
  const step = REPEAT_STEP[it.repeat]
  if (step) {
    next = shiftDays(it.due, step)
  } else {
    const p = it.due.split('-').map(Number)
    let yy = p[0], mm = p[1]
    if (it.repeat === 'monthly') { mm += 1; if (mm > 12) { mm = 1; yy += 1 } }
    else if (it.repeat === 'yearly') { yy += 1 }
    else return null
    const last = Number(endOfMonth(yy + '-' + pad2(mm) + '-01').slice(8))
    next = yy + '-' + pad2(mm) + '-' + pad2(Math.min(p[2], last))
  }
  if (!next) return null
  const copy = {
    id: newId('it'), title: it.title, dom: it.dom || null, due: next,
    status: 'todo', parent: null, imp: !!it.imp, urg: !!it.urg, repeat: it.repeat
  }
  db.ITEMS.unshift(copy)
  return copy
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
/* 收件箱归类。date 是**待办**去处的到期日（尾部可选参数，老调用方行为不变）：
 *   不传（undefined）→ 维持老行为：待办落今天、领域落不限；
 *   传具体日期       → 待办/领域都落到那天；
 *   传 null          → 明确不限日期。
 * 随心记没有日期可言，传了也忽略。 */
export function classifyInbox(id, to, date) {
  const it = db.INBOX.filter(function (x) { return x.id === id })[0]
  if (!it) return { error: '这条已经不在了' }
  const due = date === undefined ? undefined : (date || null)
  let where = ''
  if (to === 'todo') {
    const d = due === undefined ? TODAY : due
    addTodo(it.text, '', d)
    where = !d ? '待办 · 不限日期' : (d === TODAY ? '今天 · 待办' : fmtCN(d) + ' · 待办')
  } else if (to === 'note') { addNote(it.text); where = '随心记' }
  else {
    const d = domainById(to)
    if (!d) return { error: '这个领域已经不在了' }
    addTodo(it.text, d.id, due === undefined ? null : due)
    where = d.name + ' · 待办' + (due ? ' · ' + fmtCN(due) : '')
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

/* ---------------- 日期的口语解析 ----------------
   快速记里写「明天交周报」，「明天」该变成到期日，而不是留在标题里让人再去弹窗选一次。
   只认下面这一批写法，认不出的原样保留 —— **猜错一个日期比不认更糟**：
   不认最多让人去弹窗里选一次，认错了人会以为日子记对了。
   只对待办生效（见 buildResolved）：「明天午餐 32」记的是今天的钱，不是明天的钱。
   周一起头（startOfWeek），和复盘的「一周」同一个口径。 */
export function parseDatePhrase(t) {
  const out = { iso: '', text: String(t == null ? '' : t).trim() }
  let s = out.text
  if (!s) return out
  const y = Number(TODAY.slice(0, 4)), mo = Number(TODAY.slice(5, 7))
  const mk = function (yy, mm, dd) { return yy + '-' + pad2(mm) + '-' + pad2(dd) }
  const wk = function (cn) {
    const i = '一二三四五六日天'.indexOf(cn)
    return i === 6 ? 0 : i + 1            /* 「日/天」= 周日 = JS 的 0 */
  }
  function take(re, fn) {
    if (out.iso) return
    const m = re.exec(s)
    if (!m) return
    const d = fn(m)
    if (!d) return
    out.iso = d
    s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim()
  }
  take(/大后天/, function () { return shiftDays(TODAY, 3) })
  take(/后天/, function () { return shiftDays(TODAY, 2) })
  take(/明天|明日/, function () { return shiftDays(TODAY, 1) })
  take(/今天|今日/, function () { return TODAY })
  take(/(下下周|下周|下星期|下礼拜)([一二三四五六日天])/, function (m) {
    const base = startOfWeek(TODAY)
    const add = m[1] === '下下周' ? 14 : 7
    const wd = wk(m[2])
    return shiftDays(base, add + (wd === 0 ? 6 : wd - 1))
  })
  take(/(下周|下星期|下礼拜)(?![一二三四五六日天])/, function () { return shiftDays(startOfWeek(TODAY), 7) })
  take(/(本周|这周|这星期|周|星期|礼拜)([一二三四五六日天])/, function (m) {
    const wd = wk(m[2])
    const d = shiftDays(startOfWeek(TODAY), wd === 0 ? 6 : wd - 1)
    /* 这周的已经过了，说的就是下一个 —— 周六说「周五」指的是下周五 */
    return d < TODAY ? shiftDays(d, 7) : d
  })
  take(/(\d{1,2})月(\d{1,2})[日号]/, function (m) {
    const mm = Number(m[1]), dd = Number(m[2])
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
    return mk(y, mm, dd)
  })
  take(/(\d{1,2})[日号]/, function (m) {
    const dd = Number(m[1])
    if (dd < 1 || dd > 31) return null
    const d = mk(y, mo, dd)
    /* 这个月的那天已经过了，就是下个月同一天 */
    return d < TODAY ? shiftDays(endOfMonth(TODAY), dd) : d
  })
  take(/月底|月末/, function () { return endOfMonth(TODAY) })
  if (out.iso) out.text = s
  return out
}

export function ruleName(r) {
  if (!r) return '未命名规则'
  return r.t || r.kw || r.re || '未命名规则'
}

/* 常用短语：速记框里给你填的一排快捷胶囊。
 *
 * 来源 = 你**记过**的东西：待办标题、随心记正文、收件箱、以及 text 型的记录项
 * （数字型的「热量 1800」没有可复用的措辞，不收）。只收「一句话」级别的短句：
 * 随心记那种两行的感慨太长，点进去不是省事是添乱。
 *
 * 排序 = 最近（新记的靠前）× 高频（出现次数多的靠前），再加一层**前缀匹配**：
 * 你打了「喝」，就把「喝水 500ml」这些带「喝」的顶到最前；没输入时给最近最常记的。
 * 这是纯前端从已有数据里算的，不额外存任何东西 —— 越用越贴合你的措辞。 */
export function recentPhrases(query, limit) {
  const q = String(query || '').trim()
  const cap = limit || 6
  const freq = {}
  const bump = function (s) {
    const t = String(s || '').trim()
    if (!t || t.length > 40) return           /* 太长的（比如整段随心记）不收 */
    if (t.length < 2) return                  /* 单字没意义 */
    freq[t] = (freq[t] || 0) + 1
  }
  for (const it of (db.ITEMS || [])) bump(it.title)
  for (const n of (db.NOTES || [])) bump(n.text)
  for (const x of (db.INBOX || [])) bump(x.text)
  for (const rt of (db.RECORD_TYPES || [])) {
    if (rt.mode !== 'text') continue
    for (const l of (rt.logs || [])) bump(l.v)
  }
  /* 最近在前：数据天然是按「后记的靠后」追加的，倒序走一遍，给先遇到的（= 较新的）
     一个更大的序号加成，同频时更新者胜。 */
  const rank = {}
  let seq = 0
  const all = Object.keys(freq)
  /* 出现一次的低频词也收，但排在多次的后面：单次可能是偶发的、也更有用，
     因为「你昨天刚记过一句新话，今天还想再说」。 */
  const scored = all.map(function (t) {
    let score = freq[t] * 1000
    if (q && t.indexOf(q) >= 0) score += 100000          /* 前缀匹配：大幅加权 */
    return { t: t, score: score }
  })
  scored.sort(function (a, b) { return b.score - a.score })
  const out = scored.slice(0, cap).map(function (x) { return x.t })
  return out
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
  /* 待办：顺带把口语里的日期拎出来当到期日。
     只对待办做这件事 —— 「明天午餐 32」记的是今天的钱，不是明天的钱。 */
  if (tg.kind === 'todo') {
    const d = parseDatePhrase(raw)
    if (d.iso) { out.due = d.iso; out.text = d.text }
  }
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
  if (r.kind === 'todo') {
    if (r.due) return '待办 · ' + (r.due === TODAY ? '今天到期' : fmtCN(r.due) + ' 到期')
    return '待办 · 进今天'
  }
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

/* 某个月的支出：明细 + 合计 + 笔数。传 '2026-09' 这样的前缀
   （原型的 sumByCategory 就是这个用法）。
 *
 * 三个地方都在要这同一个数：今日页的「本月」（只要合计）、记账页的柱状图与合计
 * （还要明细）、空间页记账卡的摘要。原先各自 filter + reduce 扫一遍，
 * 改口径（比如某类算不算）就得改三处，漏一处两个页面就对不上 ——
 * 而这两个数并排显示在同一屏上，对不上会很难看。
 *
 * 记账页要明细画柱状图，所以 list 一并给出去，免得它为了明细再扫一遍。 */
export function monthMoney(prefix) {
  const p = String(prefix || '')
  const list = []
  let sum = 0
  for (const l of db.LOGS) {
    if (l.kind !== 'money') continue
    if (String(l.date).slice(0, 7) !== p) continue
    list.push(l)
    sum += Number(l.value || 0)
  }
  return { list: list, sum: Math.round(sum * 100) / 100, count: list.length }
}

/* 只要合计的走这里。moneyTotalOf 这个名字保留 —— 它对外的语义没变。 */
export function moneyTotalOf(prefix) { return monthMoney(prefix).sum }

/* 把一棵子项树展平成能直接 v-for 的数组。
 *
 * 为什么不写递归组件：Vue 里递归组件要额外处理 name 和 key，多一层要维护的东西；
 * 而这份数据本来就不深（原型里最深三层），展平之后一个 v-for 就够了。
 *
 * 每项带 depth / kids / path：前者管缩进，kids 决定要不要画折叠箭头 ——
 * 没有子项的也要占住那个位置，否则同一列的名字会左右跳；
 * path 是上级路径，今日页不铺整棵树，子项那行得知道它挂在谁下面。
 * 折叠状态存在 db.CLOSED_NODES 里，和原型是同一份。 */
/* 展平要用的两张表，一趟建好、整趟递归共用：
 *   byParent —— 父项 id → 直接子项（根节点归在键 '' 下）
 *   byId     —— id → 节点
 *
 * 不预建会怎样：原来每个节点都要 filter 一遍找子项、再为它单独建一张全量 id 表
 * 去反查上级路径，合起来是 **O(n²)**。800 条待办时展平一趟要 40ms，
 * 而今日页 / 领域页 / 四象限每次重渲染都要展平。实测（200 条 200ms 级 → 800 条 340ms）
 * 就是这条曲线。预建之后是 O(n)。 */
function indexById(list) {
  const m = {}
  for (const x of (list || [])) { if (x && x.id) m[x.id] = x }
  return m
}
function groupByParent(list) {
  const m = {}
  for (const x of (list || [])) {
    const k = (x.parent || '')
    if (m[k]) m[k].push(x)
    else m[k] = [x]
  }
  return m
}
function treeIndex(list) { return { byParent: groupByParent(list), byId: indexById(list) } }

/* 从预建好的 byId 表上取上级路径 —— 路径是「知识库项目上线 / 周三前」这个形状，
   今日页不铺整棵树，所以子项那行必须写清它挂在谁下面（只读展示，不是入口）。
   调用方负责「把表建一次」：这条路总是被批量使用（展平一棵树、给一列行算路径），
   表建在循环里就是 O(n²)。 */
function pathIn(byId, node) {
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

export function flattenTree(list, parentId, depth, out, idx, prefix) {
  out = out || []
  const src = list || []
  /* idx 整趟递归共用（不传就现建一次，外部调用方不用管）；
     prefix 是祖先路径，由父层往下带 —— 祖先链在递归里本来就在手上，
     没必要回头再查一遍，pathIn 那套反查只在非递归场合（quadRows）用。 */
  const c = idx || treeIndex(src)
  const level = c.byParent[parentId || ''] || []
  for (const node of level) {
    const kids = c.byParent[node.id] || []
    const closed = !!db.CLOSED_NODES[node.id]
    out.push({ node: node, depth: depth, kids: kids.length, closed: closed, path: prefix || '' })
    if (kids.length && !closed) {
      const name = labelOf(node)
      flattenTree(src, node.id, depth + 1, out, c, prefix ? prefix + ' / ' + name : name)
    }
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

/* 子项那行的灰字前面补一句上级路径。
 * 今日 / 领域 / 日历 / 四象限四处都在用它 —— 各写一遍的话，
 * 哪天改成「‹ 上级」这样的样式就只会改到一处，四处立刻不一致。 */
export function pathPrefix(row) {
  return (row && row.path) ? row.path + ' · ' : ''
}

/* 逾期与否**按这一条自己的到期日**算，不看它在哪一组里出现。
 * 一条子项挂在逾期的父项下面（子项跟着父项走），但它自己的到期日可能是今天 ——
 * 那种情况不该在它那行写「逾期」。今日页和日历共用这一份判断。 */
export function isLateRow(row) {
  const n = row && row.node
  return !!(n && n.due && n.status !== 'done' && n.due < TODAY)
}
/* 「· 09-16 到期 · 逾期 7 天」这半句。今日页和日历共用一份措辞。 */
export function lateNote(row) {
  if (!isLateRow(row)) return ''
  const n = row.node
  return ' · ' + n.due.slice(5) + ' 到期 · 逾期 ' + dayCount(n.due, TODAY) + ' 天'
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

/* 跨领域的两棵树：今日页的习惯块和计划块。
 * 一份构建处 —— 今日页和领域页读的是同一批行对象，只是这里多带一个 dom。
 *
 * 习惯行额外带上「连续/累计」和「今天打没打卡」两个字段。理由是模板里那两个值
 * 原来是这样取的：streak(r.node.id) 出现 3 次（v-if + :class + 插值）、
 * habitDoneOn(r.node.id, TODAY) 出现 2 次 —— 5 次调用、每次都要扫一遍
 * HABIT_LOGS 并排序，实测 106 个习惯行要 1.2 秒。算一次挂上来，模板直接读。 */
function crossTree(k) {
  const out = []
  for (const d of db.DOMAINS) {
    const list = domainBucket(d, k)
    for (const r of flattenTree(list, null, 0)) {
      const row = {
        node: r.node, depth: r.depth, kids: r.kids, closed: r.closed, path: r.path,
        dom: d, list: list, spec: specOf(k, r.node.id)
      }
        if (k === 'habit') {
          /* 把 habitRowExtra 的**全部**字段挂上行（streak/doneToday/target/periodCount/…）。
             用 Object.assign 而不是逐个挑 —— 逐个挑的话，下次给行加字段这里就会漏：
             多次打卡的进度第一版就是这么漏的，按钮永远显示单次的样子。 */
          Object.assign(row, habitRowExtra(r.node, TODAY))
        }
      out.push(row)
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
  /* 整棵树的索引建一次，递归里共用 —— 原来每个节点都要 filter 一遍找子项、
     再单独建一张全量 id 表反查上级路径，是这一页最贵的地方。 */
  const idx = treeIndex(db.ITEMS)
  /* kids 数的是**可见的子项**，不是全部。待办这一组不显示已完成的子项，
     那个「N 项」徽标就得按同一口径数 —— 写着 2 项却只数得出 1 条，
     人会以为有一条被藏起来了（它确实被藏起来了，但在另一个视图里）。 */
  function rowObject(node, depth, over, kidCount) {
    return {
      node, depth, over,
      kids: kidCount === undefined ? (idx.byParent[node.id] || []).length : kidCount,
      closed: !!db.CLOSED_NODES[node.id],
      path: pathIn(idx.byId, node),
      spec: specOf('item', node.id)
    }
  }

  /* 待办这一组：从顶层铺，子项跟着父项走 —— 但**已完成的子项不跟**。
     它们做完那一刻就归到「已完成」视图去了；留在这边会让「还剩几件」虚高，
     而且一条划掉的名字夹在待办中间，本来也不是待办该有的样子。
     子项自己的到期日照旧不看（它是「这件事的一部分」，不是另一个独立承诺）。 */
  function build(src, over) {
    const out = [], seen = {}
    function emit(node, depth) {
      if (seen[node.id]) return
      seen[node.id] = 1
      const live = (idx.byParent[node.id] || []).filter(function (k) { return k.status !== 'done' })
      out.push(rowObject(node, depth, over, live.length))
      if (db.CLOSED_NODES[node.id]) return
      for (const k of live) emit(k, depth + 1)
    }
    for (const it of src) {
      if (it.parent && picked[it.parent]) continue
      emit(it, 0)
    }
    return out
  }

  /* 已完成那一组：**平铺，不铺树**。
     一条做完的子项，它的父项很可能还没完（「写周报」下面那条做完了，周报本身没写完）——
     挂回父项下面会让人以为父项也做完了。平铺着列、灰字标出它原本挂在哪，才说得准。
     所以这一组也不给折叠三角：本来就是平的，展开也没东西可展。 */
  const done = r.done.map(function (it) {
    const o = rowObject(it, 0, false)
    o.kids = 0
    return o
  })

  const overdue = build(r.overdue, true)
  const due = build(r.due, false)
  return {
    overdue,
    due,
    /* 逾期和今天到期合成一条列表：它们本来就是同一种东西（没做完的待办），
       差的只是到期日早晚。分成两张卡片之后，「今天还剩几件」要在两处各数一遍，
       两个标题也在做同一件事。合并后按到期日自然排序 ——
       欠着的本来就在最前面，「这一天的第一眼看见最欠着的」这条并没有丢。
       overdue / due 仍然分开返回：只想看其中一组的时候还要用。 */
    open: overdue.concat(due),
    done: done
  }
}

/* ---------------- 四象限 ----------------
 * 四象限是**又一个属性**，不是又一个页面 —— 和 D4「跨度是属性，不是页面」同一条道理。
 * 它只回答一个问题：接下来先做哪个。
 *
 * 「重要」和「紧急」是两个**独立的轴**，所以数据里存两个布尔，不存 1–4 的编号。
 * 编号是这两个轴的组合；存组合的话，以后想只看「所有重要的」得先反解一遍，
 * 而两个轴本身才是真东西。编号只活在界面上（编辑弹窗里那个 2×2 选择器）。
 *
 * 两个轴都**由人标**，不自动推断。想过「逾期或今天到期就算紧急」，放弃了：
 * 那样四个格子会长期是机器分好的样子，人就不再看了 —— 一个没人看的视图，再准也等于没有。
 * 而且标这个动作本身有用：把「重要不紧急」和「紧急不重要」分开，是这套方法唯一的价值。
 */
export const QUAD = [
  { k: '1', n: '重要且紧急', act: '马上做' },
  { k: '2', n: '重要不紧急', act: '定个时间做' },
  { k: '3', n: '紧急不重要', act: '尽快甩掉' },
  { k: '4', n: '不重要也不紧急', act: '别做' }
]

export function quadOf(node) {
  const imp = !!(node && node.imp), urg = !!(node && node.urg)
  if (imp && urg) return '1'
  if (imp) return '2'
  if (urg) return '3'
  return '4'
}

/* 界面上一次点选 = 同时定两个轴。数据里仍然是两个独立的 bool。 */
export function setQuad(node, q) {
  if (!node) return
  node.imp = (q === '1' || q === '2')
  node.urg = (q === '1' || q === '3')
}

export function quadName(k) {
  for (const q of QUAD) if (q.k === k) return q.n
  return ''
}

/* 象限 → 颜色档。**四个档都给色**，第 4 格是灰。
   原来第 4 格刻意不给：它是「没标过 / 不用管」的那格，给色像是在提醒人看它。
   但放到今日页的待办列表里这个理由站不住 —— 红蓝橙都有条、就它没有，
   读出来的是「这条还没标」，而不是「这条不重要」，
   两种意思混在同一个「没有颜色」上，反而说不清。
   四档都有色之后，每一条待办都看得出自己被分到了哪儿。
   四象限页的卡片底色、待办行左边那条竖色条，都用这一个映射 ——
   两处各写一套的话，改一个色另一个就悄悄对不上了。 */
export function quadTone(k) {
  return (k === '1' || k === '2' || k === '3' || k === '4') ? k : ''
}

/* ---------------- 四象限配色 ---------------- */
/* QUAD_COLOR_DEFAULT / QUAD_KEYS 在文件上方声明 —— db 的初始值要用它们，
   而 const 在初始化之前取不到，所以不能放在这儿。 */

function hexOf(v, fallback) {
  const p = /^#?([0-9a-f]{6})$/i.exec(String(v || ''))
  return p ? '#' + p[1].toLowerCase() : fallback
}
/* 把颜色往白里混。t 是颜色自己的占比，0.12 和设计变量里那几个 -bg 的深浅一致：
   太深会压住正文，太浅就看不出是哪一格了。
   不用 CSS 的 color-mix()：App 端走系统 WebView，老内核不认，H5 认了 App 也不认。 */
function tintOf(hex, t) {
  const n = parseInt(hex.slice(1), 16)
  const c = function (v) {
    const s = Math.round(v * t + 255 * (1 - t)).toString(16)
    return s.length < 2 ? '0' + s : s
  }
  return '#' + c((n >> 16) & 255) + c((n >> 8) & 255) + c(n & 255)
}

/* 根节点上要注入的那串 CSS 变量。四个主色加四个调淡后的底色，
   四象限页、待办行的色条、编辑弹窗的 2×2 选择器读的都是这几个 ——
   在设置里改一个颜色，三处一起变，不用挨个组件去改。 */
export function quadVarStyle() {
  const src = db.QUAD_COLORS || {}
  const out = []
  for (const k of QUAD_KEYS) {
    const base = hexOf(src[k], QUAD_COLOR_DEFAULT[k])
    out.push('--' + k + ':' + base)
    out.push('--' + k + '-bg:' + tintOf(base, 0.12))
  }
  return out.join(';')
}

export function setQuadColor(k, hex) {
  if (QUAD_KEYS.indexOf(k) < 0) return { error: '没有这个象限' }
  if (!db.QUAD_COLORS) db.QUAD_COLORS = {}
  const v = hexOf(hex, '')
  if (!v) return { error: '颜色要写成 #RRGGBB' }
  db.QUAD_COLORS[k] = v
  return { ok: true, hex: v }
}

/* ---------------- 打卡完成色（设置页选，打卡按钮的完成态用） ----------------
 * 默认空 = 用内置的绿。用户给的是「深色主色」—— 完成态是实心圆 + 白勾，
 * 进度环、描边、环心数字都用同一个色，不需要再派生浅底。
 * 清数据（clearAllData）不清它：清的是记录，不该连外观偏好一起抹掉。 */
export function setTickDone(color) {
  const v = hexOf(color, '')
  if (!v) { db.TICK_DONE = ''; return { ok: true, hex: '' } }
  db.TICK_DONE = v
  return { ok: true, hex: v }
}

export function quadColorOf(k) {
  return hexOf((db.QUAD_COLORS || {})[k], QUAD_COLOR_DEFAULT[k])
}

/* 四象限那一页要的行：**全部未完成**，跨领域、不限日期。
 *   ① 只看今天的话每格顶多一两件，排不出「重要且紧急」和「重要不紧急」的比例，
 *      那这四个格子就白摆了。
 *   ② 平铺、不铺树。子项的四象限是它自己的事，挂回父项下面会让人以为跟着父项走；
 *      而且这一页每一格都是平的，缩进在这里没有意义。
 *   ③ 已完成的也不留。这四个格子问的是「接下来做什么」，不是「做过什么」。
 * 排序：有日期的按日期升序排前面，没日期的沉到最后 —— 同一格里先看快到期的。
 */
export function quadRows() {
  const g = { '1': [], '2': [], '3': [], '4': [] }
  /* id 表建一次。原来每一条都单独走一遍「现建一张全量 id 表再去反查上级路径」，
     800 条待办时要 220ms，全花在这上面。 */
  const byId = indexById(db.ITEMS)
  for (const it of (db.ITEMS || [])) {
    if (it.status === 'done') continue
    g[quadOf(it)].push({
      node: it,
      path: pathIn(byId, it),
      spec: specOf('item', it.id),
      kids: 0, depth: 0, closed: false
    })
  }
  function byDue(a, b) {
    const x = a.node.due || '9999-99-99', y = b.node.due || '9999-99-99'
    return x < y ? -1 : (x > y ? 1 : 0)
  }
  for (const q of ['1', '2', '3', '4']) g[q].sort(byDue)
  return g
}

/* ---------------- 日历 ----------------
 * 待办在时间轴上的样子。今日页是「这一天」，日历是「这个月」——
 * 同一批事换个焦距。所以它读的还是 ITEMS，没有第二份存储，也没有「日历事件」这种东西。
 *
 * 一个月的账**只算一遍**：先把有东西的日子摊成几张按天索引的表，再去铺格子。
 * 按格子各扫一遍全量数据的话是 42 × 全量，白扫 41 遍。
 *
 * 随心记**不进这里**（「零字段文本框，不进任何聚合与复盘」），收集箱也不进 ——
 * 它们是「还没归属的东西」，日历只放已经落在某一天上的事。
 */
export function shiftMonths(iso, n) {
  const p = String(iso).split('-').map(Number)
  return isoOf(new Date(p[0], p[1] - 1 + n, 1))
}

export function monthView(anchorIso) {
  const p = String(anchorIso).split('-').map(Number)
  const y = p[0], m = p[1]
  const first = y + '-' + pad2(m) + '-01'
  /* 周一起头。网格第一格是「含 1 号的那一周的周一」，可能落在上个月。 */
  const lead = startOfWeek(first)

  const open = {}, done = {}, habit = {}, money = {}, rt = {}
  for (const it of (db.ITEMS || [])) {
    if (!it.due) continue
    if (it.status === 'done') done[it.due] = (done[it.due] || 0) + 1
    else open[it.due] = (open[it.due] || 0) + 1
  }
  for (const h of (db.HABIT_LOGS || [])) if (h.date) habit[h.date] = (habit[h.date] || 0) + 1
  for (const l of (db.LOGS || [])) {
    if (!l.date) continue
    /* money 在这里存的是**当天的支出合计**，不是笔数 ——
       格子里要显示的是「那天花了多少」。笔数另外由 dayMarks 给。 */
    if (l.kind === 'money') money[l.date] = (money[l.date] || 0) + Number(l.value || 0)
    else rt[l.date] = (rt[l.date] || 0) + 1
  }
  for (const t of (db.RECORD_TYPES || [])) {
    if (t.retired) continue
    for (const l of (t.logs || [])) {
      const iso = isoOfCnDate(l.d, TODAY)
      if (iso) rt[iso] = (rt[iso] || 0) + 1
    }
  }

  /* 行数按「这个月最后一天落在第几周」算。固定铺 6 行的话，
     有些月份会多出一整行全是灰的 —— 那一行每天都在，却什么也不表示。 */
  const lastDay = new Date(y, m, 0).getDate()
  const need = dayCount(lead, y + '-' + pad2(m) + '-' + pad2(lastDay)) + 1
  const rows = Math.ceil(need / 7)

  const cells = []
  let mOpen = 0, mDone = 0
  for (let i = 0; i < rows * 7; i++) {
    const iso = shiftDays(lead, i)
    const inMonth = Number(iso.slice(5, 7)) === m
    const c = {
      iso, day: Number(iso.slice(8)), inMonth,
      today: iso === TODAY,
      open: open[iso] || 0,
      done: done[iso] || 0,
      habit: habit[iso] || 0,
      money: Math.round((money[iso] || 0) * 100) / 100,
      rt: rt[iso] || 0
    }
    c.any = !!(c.habit || c.money || c.rt)
    if (inMonth) { mOpen += c.open; mDone += c.done }
    cells.push(c)
  }

  return {
    y, m, first, lead, rows, cells,
    /* last 给账单那一条用（算这一期的合计、以及和上个月比）*/
    last: y + '-' + pad2(m) + '-' + pad2(lastDay),
    label: y + ' 年 ' + m + ' 月',
    mOpen, mDone
  }
}

/* 选中那一天列出来的东西。**平铺**，和「已完成」那一组同一个理由：
   日历是按日子在看的，把跨天的一棵树缩进铺出来，反而看不出哪些是那天的。 */
export function dayRows(iso) {
  const out = []
  /* id 表建一次 —— 原来每条命中的待办都要单独重建一张全量 id 表去反查路径。
     命中 k 条时是 O(k·n)。 */
  const byId = indexById(db.ITEMS)
  for (const it of (db.ITEMS || [])) {
    if (it.due !== iso) continue
    out.push({
      node: it, depth: 0, kids: 0, closed: false,
      path: pathIn(byId, it),
      spec: specOf('item', it.id)
    })
  }
  /* 没做完的排前面，做完的沉下去 —— 和今日页同一个先后 */
  out.sort(function (a, b) {
    return (a.node.status === 'done' ? 1 : 0) - (b.node.status === 'done' ? 1 : 0)
  })
  return out
}

/* 那一天除了待办，还留下了什么。日历格子只放得下几个点，
   点开某一天要给得出「点的到底是什么」。 */
export function dayMarks(iso) {
  const habits = [], rts = []
  for (const h of (db.HABIT_LOGS || [])) {
    if (h.date !== iso) continue
    const hb = habitById(h.key)
    const n = hb ? labelOf(hb) : ''
    if (n && habits.indexOf(n) < 0) habits.push(n)
  }
  const moneyList = []
  let moneyCount = 0, moneySum = 0
  for (const l of (db.LOGS || [])) {
    if (l.date !== iso || l.kind !== 'money') continue
    moneyCount++
    moneySum += Number(l.value || 0)
    /* 日历那天那一栏要把每一笔列出来（分类 + 金额），不是只给个合计 */
    moneyList.push({ category: l.category || '未分类', value: Math.round(Number(l.value || 0) * 100) / 100 })
  }
  for (const t of (db.RECORD_TYPES || [])) {
    if (t.retired) continue
    for (const l of (t.logs || [])) {
      if (isoOfCnDate(l.d, TODAY) === iso) {
        rts.push({ name: t.name, v: l.v, unit: t.unit || '' })
      }
    }
  }
  return { habits, moneyList, moneyCount, moneySum: Math.round(moneySum * 100) / 100, rts }
}

export function shiftWeeks(iso, n) { return shiftDays(iso, n * 7) }

/* 一周的议程：一天一行，那天的事列在行下面。
 *
 * 为什么不是 7 列看板：一列只有五十几个像素宽，待办标题连一行都放不下。
 * 为什么不是「一天一页左右翻」：那样看不出这一周整体的节奏，
 * 而周视图存在的理由恰恰就是看节奏。
 *
 * 取数和 monthView 同一个做法：**这一周只扫一遍全量数据**，把有东西的日子摊成
 * 按天索引的表，再读 7 格。
 * （原来是 7 天各调一次 dayRows + dayMarks —— 各扫一遍全量、而且 dayRows 里
 *   每条还要算一次上级路径，实测 800 条待办时整周要 130ms。当初的注释说
 *   「7 遍和 42 遍不是一回事，不值得拆成两套写法」，实测下来这一页是要撑住的，
 *   所以顺手把 dayRows 本身也改成 O(n) 了。） */
export function weekView(anchorIso) {
  const lead = startOfWeek(anchorIso || TODAY)

  const byId = indexById(db.ITEMS)
  const itemsByDay = {}
  for (const it of (db.ITEMS || [])) {
    if (!it.due) continue
    const b = itemsByDay[it.due] || (itemsByDay[it.due] = { open: [], done: 0 })
    if (it.status === 'done') b.done++
    else b.open.push(it)
  }

  /* 打卡那一格数的是「那天打过卡的习惯**名字**数」，不是流水条数 ——
     口径必须和 dayMarks 一致（一天给两个子习惯打卡算 1 个名字）。
     习惯 id → 名字的表建一次，免得每条流水都去 habitById 扫一遍领域桶。 */
  const habitLabel = {}
  for (const d of (db.DOMAINS || [])) {
    for (const h of (d.habits || [])) habitLabel[h.id] = labelOf(h)
  }
  const habitNamesByDay = {}
  for (const h of (db.HABIT_LOGS || [])) {
    if (!h.date) continue
    const n = habitLabel[h.key]
    if (!n) continue
    const arr = habitNamesByDay[h.date] || (habitNamesByDay[h.date] = [])
    if (arr.indexOf(n) < 0) arr.push(n)
  }

  const moneyByDay = {}
  for (const l of (db.LOGS || [])) {
    if (!l.date || l.kind !== 'money') continue
    moneyByDay[l.date] = (moneyByDay[l.date] || 0) + Number(l.value || 0)
  }

  const rtByDay = {}
  for (const t of (db.RECORD_TYPES || [])) {
    if (t.retired) continue
    for (const l of (t.logs || [])) {
      const iso = isoOfCnDate(l.d, TODAY)
      if (iso) rtByDay[iso] = (rtByDay[iso] || 0) + 1
    }
  }

  const days = []
  for (let i = 0; i < 7; i++) {
    const iso = shiftDays(lead, i)
    const b = itemsByDay[iso]
    const live = b ? b.open : []
    days.push({
      iso,
      d: Number(iso.slice(8)),
      w: weekdayCN(iso),
      today: iso === TODAY,
      /* 平铺、且顺序和 db.ITEMS 里的先后一致（dayRows 排完后非完成的就是这个顺序） */
      rows: live.map(function (it) {
        return {
          node: it, depth: 0, kids: 0, closed: false,
          path: pathIn(byId, it), spec: specOf('item', it.id)
        }
      }),
      done: b ? b.done : 0,
      habit: (habitNamesByDay[iso] || []).length,
      moneySum: Math.round((moneyByDay[iso] || 0) * 100) / 100,
      rt: rtByDay[iso] || 0
    })
  }
  return { lead, days, last: days[6].iso }
}

/* 一段时间里的账。月视图和周视图各要一条汇总，所以做成通用的 ——
 * 传这一期的区间，以及上一期的区间。
 *
 * 「对比上期」是这里最容易做错的一处：上一期一笔都没记的时候，
 * 不能拿 0 当分母算出「多了 100%」—— 那种数会让人以为账坏了。
 * 所以 prev / prevCount 原样给出去，措辞由显示层决定（见 calendar.vue）。 */
export function moneyBrief(from, to, pf, pt) {
  const cats = {}
  let sum = 0, count = 0
  let prev = 0, prevCount = 0
  /* 本期和上期在**同一次遍历**里分别累（原来是扫两遍）。
     两个 if 是独立的、不是 else if：区间是可以重叠的（自定义区间可能压到上一期上），
     而这两个数是分开的两个指标，重叠的那几笔本来就该各算一次。 */
  for (const l of (db.LOGS || [])) {
    if (l.kind !== 'money') continue
    const v = Number(l.value || 0)
    if (inRange(l.date, from, to)) {
      sum += v
      count++
      const k = l.category || '未分类'
      cats[k] = (cats[k] || 0) + v
    }
    if (pf && pt && inRange(l.date, pf, pt)) {
      prev += v
      prevCount++
    }
  }
  const list = []
  for (const k in cats) list.push({ name: k, sum: Math.round(cats[k] * 100) / 100 })
  list.sort(function (a, b) { return b.sum - a.sum })

  return {
    sum: Math.round(sum * 100) / 100,
    count,
    cats: list,
    prev: Math.round(prev * 100) / 100,
    prevCount
  }
}

/* ---------------- 全局搜索 ----------------
 * 数据全在本机，遍历就够了 —— 不建索引、不防抖，输入什么搜什么。
 * 本地优先的一个隐藏好处：搜索不经过任何服务器，也没有「搜不到是因为没同步」这种事。
 * 返回 null = 还没输入要搜的字。每一组都可能为空。
 * 计划（goal）不给 spec：它的编辑要走进度弹窗，那一轮还没搬，
 * 给了也点不动，不如如实不给出「能点」的样子。 */
export function searchAll(q) {
  const kw = String(q || '').trim().toLowerCase()
  if (!kw) return null
  const hit = function (s) { return String(s == null ? '' : s).toLowerCase().indexOf(kw) >= 0 }
  const todos = [], habits = [], goals = [], moneyRows = [], notes = [], inbox = []
  for (const it of (db.ITEMS || [])) {
    if (!hit(it.title)) continue
    todos.push({
      id: it.id, title: it.title, done: it.status === 'done',
      sub: domainName(it) + (it.due ? ' · ' + fmtCN(it.due) : ''),
      spec: specOf('item', it.id)
    })
  }
  for (const d of (db.DOMAINS || [])) {
    for (const h of (d.habits || [])) {
      if (hit(h.t)) habits.push({ id: h.id, title: labelOf(h), sub: d.name, spec: specOf('habit', h.id) })
    }
    for (const g of (d.goals || [])) {
      if (hit(g.t)) goals.push({ id: g.id, title: labelOf(g), sub: d.name + (g.m ? ' · ' + g.m : '') })
    }
  }
  for (const l of (db.LOGS || [])) {
    if (l.kind !== 'money') continue
    if (!hit(l.category) && !hit(l.text) && !hit(String(l.value))) continue
    moneyRows.push({ id: l.id, title: (l.category || '未分类') + ' ' + money(l.value), sub: fmtCN(l.date), spec: 'money:' + l.id })
  }
  for (const n of (db.NOTES || [])) {
    if (hit(n.text)) notes.push({ id: n.id, title: n.text, sub: '随心记 · ' + fmtCN(n.d) })
  }
  for (const n of (db.INBOX || [])) {
    if (hit(n.text)) inbox.push({ id: n.id, title: n.text, sub: '收件箱 · ' + n.at })
  }
  return {
    todos, habits, goals, money: moneyRows, notes, inbox,
    total: todos.length + habits.length + goals.length + moneyRows.length + notes.length + inbox.length
  }
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

/* ---------------- 复盘 ----------------
   复盘是「读取层」，不是又多了一张数据表：这一节里没有一个数字是存下来的，
   全是从 ITEMS / LOGS / HABIT_LOGS / RECORD_TYPES 当场算的。
   **刻意不读 NOTES** —— 随心记一旦被复盘看见，人写的时候就会开始表演。 */

export function inRange(d, from, to) {
  const s = String(d || '')
  return !!s && s >= from && s <= to
}

export function reviewRange() {
  if (db.REV_MODE === 'month') return { from: startOfMonth(TODAY), to: TODAY }
  if (db.REV_MODE === 'custom') return { from: db.REV_FROM || startOfWeek(TODAY), to: db.REV_TO || TODAY }
  return { from: startOfWeek(TODAY), to: TODAY }
}

/* 上一期 = 往前挪一段**一样长**的。含头含尾，所以天数要 +1。
   原型那里少加了 1，于是 9月14–18 日的「上一期」算成 9月10–14 日 ——
   14 号那一天同时进了本期和上一期，同一笔账被自己比了一遍。 */
export function prevRange(r) {
  const n = dayCount(r.from, r.to) + 1
  return { from: shiftDays(r.from, -n), to: shiftDays(r.to, -n) }
}

export function rangeLabel(r) {
  return fmtCN(r.from) + (r.from === r.to ? '' : ' – ' + fmtCN(r.to))
}

/* 切到「自定义」时把当前区间落成两个具体日子，日期轮盘一打开就有值。 */
export function setRevMode(m) {
  if (['week', 'month', 'custom'].indexOf(m) < 0) return
  db.REV_MODE = m
  if (m === 'custom') {
    const r = reviewRange()
    db.REV_FROM = r.from
    db.REV_TO = r.to
  }
}

export function setRevEnd(which, iso) {
  const v = String(iso || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return
  if (db.REV_MODE !== 'custom') db.REV_MODE = 'custom'
  /* 起 > 止 的话区间是负的，那些「这一期 N 天」会算出看不懂的数 ——
     所以改完一头，另一头跟着挪，而不是报错。 */
  if (which === 'from') {
    db.REV_FROM = v
    if (db.REV_TO < v) db.REV_TO = v
  } else {
    db.REV_TO = v
    if (db.REV_FROM > v) db.REV_FROM = v
  }
}

/* ---- 聚合：每个数字只在这里算一次 ---- */
export function todosIn(from, to) {
  let done = 0, total = 0
  for (const it of db.ITEMS) {
    if (!inRange(it.due, from, to)) continue
    total++
    if (it.status === 'done') done++
  }
  return { done: done, total: total }
}
/* 习惯「有打卡的天数」，同一天打三次也只算一天 —— 次数看着热闹，
   但它说明不了「这几天有没有在坚持」。 */
export function habitDaysIn(from, to) {
  const seen = {}
  for (const h of db.HABIT_LOGS) {
    if (inRange(h.date, from, to)) seen[h.date] = 1
  }
  return Object.keys(seen).length
}
export function moneyIn(from, to) {
  let t = 0
  for (const l of db.LOGS) {
    if (l.kind === 'money' && inRange(l.date, from, to)) t += Number(l.value || 0)
  }
  return Math.round(t * 100) / 100
}
function rtLogsIn(rt, from, to) {
  const out = []
  for (const l of (rt && rt.logs) || []) {
    if (inRange(isoOfCnDate(l.d, TODAY), from, to)) out.push(l)
  }
  return out
}
/* 文字型记录项在这一期记了什么 —— 复盘真正想看的细节。
   它们的日期是「9月16日 周三」这种给人看的串，先还原成 ISO 再比。 */
export function textLogsIn(from, to) {
  const out = []
  for (const t of db.RECORD_TYPES) {
    if (t.mode !== 'text' || t.retired) continue
    for (const l of rtLogsIn(t, from, to)) out.push({ d: isoOfCnDate(l.d, TODAY), name: t.name, v: l.v })
  }
  out.sort(function (a, b) { return a.d < b.d ? 1 : (a.d > b.d ? -1 : 0) })
  return out
}
/* 这一期一共记了几笔：支出 + 所有记录项。 */
export function captureCount(from, to) {
  let n = 0
  for (const l of db.LOGS) { if (inRange(l.date, from, to)) n++ }
  for (const t of db.RECORD_TYPES) {
    if (t.retired) continue
    n += rtLogsIn(t, from, to).length
  }
  return n
}
export function avgOfRt(id, from, to) {
  const rt = rtById(id)
  if (!rt) return null
  const hit = rtLogsIn(rt, from, to)
  if (!hit.length) return null
  let sum = 0
  for (const l of hit) sum += Number(l.v || 0)
  return Math.round(sum / hit.length * 10) / 10
}

/* ---- 趋势清单：只存「我选了哪几项」，怎么算由 metricDefs 定义 ----
   所以加一项趋势不用动渲染代码，新建一个数值记录项它自己就出现在候选里。 */
export function metricDefs() {
  const out = [
    { k: 'money', name: '支出', unit: '¥' },
    { k: 'habit', name: '打卡天数', unit: '天' },
    { k: 'todo', name: '待办完成', unit: '' }
  ]
  for (const t of db.RECORD_TYPES) {
    if (t.mode !== 'number' || t.retired) continue   /* 纯文字的记录项没有数值可画 */
    out.push({ k: 'rt', id: t.id, name: t.name, unit: t.unit || '' })
  }
  return out
}
export function metricKey(sel) {
  return sel.k === 'rt' ? ('rt:' + sel.id) : sel.k
}
export function findMetric(k, id) {
  for (const df of metricDefs()) {
    if (df.k !== k) continue
    if (k !== 'rt' || df.id === id) return df
  }
  return null
}
/* 认不出的（比如那个记录项已经收起来了）不铺，但**留在清单里** ——
   把记录项恢复出来，那一行原本看的是哪项还在。 */
export function trendRows() {
  const out = []
  for (const sel of (db.REV_TRENDS || [])) {
    const def = findMetric(sel.k, sel.id)
    if (def) out.push({ def: def, key: metricKey(sel) })
  }
  return out
}
export function trendCandidates() {
  const used = {}
  for (const sel of (db.REV_TRENDS || [])) used[metricKey(sel)] = 1
  return metricDefs().filter(df => !used[metricKey(df)])
}
export function addTrend(key) {
  const cut = String(key || '').indexOf(':')
  const k = cut < 0 ? String(key || '') : String(key).slice(0, cut)
  const id = cut < 0 ? '' : String(key).slice(cut + 1)
  if (!findMetric(k, id)) return false
  if (!db.REV_TRENDS) db.REV_TRENDS = []
  for (const sel of db.REV_TRENDS) { if (metricKey(sel) === metricKey({ k: k, id: id })) return false }
  db.REV_TRENDS.push(k === 'rt' ? { k: 'rt', id: id } : { k: k })
  return true
}
export function delTrend(key) {
  const list = db.REV_TRENDS || []
  for (let i = 0; i < list.length; i++) {
    if (metricKey(list[i]) !== String(key)) continue
    const def = findMetric(list[i].k, list[i].id)
    list.splice(i, 1)
    return { name: def ? def.name : String(key) }
  }
  return null
}

function thousands(n, dec) {
  const v = (dec === 0) ? Math.round(n) : Math.round(n * 10) / 10
  let s = (v % 1 === 0) ? String(v) : v.toFixed(1)
  const p = s.split('.')
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return p.join('.')
}
/* 记录项记的都是整数（热量 1800、深蹲 80）→ 均值也按整数显示。
   「约 1823.3 kcal」那种精度不是我算得准，是我没收拾。 */
function rtIntegerOnly(id) {
  const rt = rtById(id)
  if (!rt || !(rt.logs || []).length) return false
  for (const l of rt.logs) { if (Number(l.v) % 1 !== 0) return false }
  return true
}

/* 一项趋势在一期里长什么样。统一是「本期 · 上一期」——
   横向比必须比同一件事，不能这周看均值、上周看最新值。 */
export function metricLine(def, d) {
  if (def.k === 'money') return money(d.money) + ' · 上一期 ' + money(d.moneyPrev)
  if (def.k === 'habit') return d.habit + ' / ' + d.days + ' 天'
  if (def.k === 'todo') return d.todos.total ? (d.todos.done + ' / ' + d.todos.total) : '— 这一期没有到期的待办'
  const now = avgOfRt(def.id, d.range.from, d.range.to)
  const prev = avgOfRt(def.id, d.prev.from, d.prev.to)
  const u = def.unit ? (' ' + def.unit) : ''
  const dec = rtIntegerOnly(def.id) ? 0 : 1
  if (now === null && prev === null) return '— 这一期和上一期都没记'
  return (now === null ? '— 这一期没记' : (thousands(now, dec) + u)) +
    ' · 上一期 ' + (prev === null ? '没记' : (thousands(prev, dec) + u))
}

export function reviewData() {
  const r = reviewRange()
  const p = prevRange(r)
  /* 这一期和上一期要的数**一次遍历**累出来。
     原来是分头扫：moneyIn(本期) / moneyIn(上期) / captureCount ，加上
     textLogsIn 内部的 rtLogsIn，db.LOGS 被扫了三四遍。
     两个区间判断必须**独立**（不能 else if）—— 自定义区间可以压到上一期上，
     重叠的那几笔在两个指标里本来就该各算一次。
     口径要和被替掉的那几个函数一字不差：captureCount 数的是**全部** LOGS 条数，
     而 money 只认 kind==='money'。 */
  let moneyNow = 0, moneyPrev = 0, captures = 0
  for (const l of db.LOGS) {
    if (inRange(l.date, r.from, r.to)) {
      captures++
      if (l.kind === 'money') moneyNow += Number(l.value || 0)
    }
    if (l.kind === 'money' && inRange(l.date, p.from, p.to)) moneyPrev += Number(l.value || 0)
  }
  for (const t of db.RECORD_TYPES) {
    if (t.retired) continue
    captures += rtLogsIn(t, r.from, r.to).length
  }
  return {
    range: r, prev: p, days: dayCount(r.from, r.to) + 1,
    todos: todosIn(r.from, r.to),
    habit: habitDaysIn(r.from, r.to),
    money: Math.round(moneyNow * 100) / 100,
    moneyPrev: Math.round(moneyPrev * 100) / 100,
    captures: captures,
    texts: textLogsIn(r.from, r.to)
  }
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
    /* 子项继承父项的**领域、日期和四象限** —— 理由同前：它是「这件事的一部分」，
       不是另一个独立承诺。四象限不继承的话，四象限页那一列是平铺的，
       一条子项会跑得离父项很远，看着像两件不相干的事。 */
    node = {
      id: newId('it'), title: t, dom: p.dom || null, due: p.due || null,
      status: 'todo', parent: p.id, imp: !!p.imp, urg: !!p.urg
    }
    /* 排最前。要和下面习惯/计划那条路一致 —— 原来是 push 到末尾，
       于是同一个动作在三处表现不一样（注释写的是「新加的排最前」，待办那条没照做）。
       排最前的好处是刚加的那条立刻看得见，不用在一串同级里找。 */
    db.ITEMS.unshift(node)
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
      /* 重复只在有到期日时才有意义 —— 「每周五」得先有「周五」。
         选了重复但没填日期的话，commitEdit 会把它退回来。 */
      { k: 'repeat', label: '重复', type: 'chips', opts: [['', '不重复'], ['daily', '每天'], ['weekly', '每周'], ['monthly', '每月'], ['yearly', '每年']] },
      /* 四象限是一格两选（重要 × 紧急），不是一排平铺的选项 ——
         它自己长成一个 2×2，和这个概念的形状对上，也不用读说明。 */
      { k: 'quad', label: '四象限', type: 'quad' },
      { k: 'status', label: '状态', type: 'chips', opts: [['todo', '待办'], ['done', '已完成']] },
      { k: 'dom', label: '领域', type: 'chips', opts: domainOpts() }
    ]
  }
  if (ED.kind === 'habit') {
    return [
      { k: 't', label: '习惯（必填）', type: 'text' },
      /* 频率用滚轮选不用手填：它只有「单位 × 次数」两种组合，
         手填会填出「一周四次」「周4」「每周4次」三种写法，复盘里没法归到一起。 */
      { k: 'm', label: '频率', type: 'freq' },
      /* 提醒时间。**想不想被提醒**是习惯自己的属性，所以放在这个弹窗里，
         和「每天几次」并排；**能不能响**是设备的事，总开关在设置页。
         空 = 不提醒（默认），一颗习惯一颗习惯地开 —— 不做一个「全部习惯都提醒」的批处理，
         那会把一个安静的工具变成一个催命的东西。 */
      { k: 'rm', label: '提醒我', type: 'time' }
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
    ? {
      title: hit.node.title, due: hit.node.due || '', dom: hit.node.dom || '',
      status: hit.node.status || 'todo', quad: quadOf(hit.node),
      repeat: hit.node.repeat || ''
    }
    : { t: labelOf(hit.node), m: hit.node.m || '', rm: remindTimeOf(hit.node) }
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
    const q0 = quadOf(it), q1 = dr.quad || q0
    const r0 = it.repeat || '', r1 = dr.repeat || ''
    if (it.title !== t1) ch.push('内容「' + it.title + '」→「' + t1 + '」')
    if ((it.due || '') !== (dr.due || '')) ch.push('到期日 ' + (it.due || '没有') + ' → ' + (dr.due || '没有'))
    if (r0 !== r1) ch.push('重复 ' + (repeatName(r0) || '不重复') + ' → ' + (repeatName(r1) || '不重复'))
    if ((it.dom || '') !== (dr.dom || '')) ch.push('领域「' + domainName(it) + '」→「'
      + (dr.dom && domainById(dr.dom) ? domainById(dr.dom).name : '未归类') + '」')
    if (q0 !== q1) ch.push('四象限 ' + quadName(q0) + ' → ' + quadName(q1))
    if (st0 !== st1) ch.push('状态 ' + (st0 === 'done' ? '已完成' : '待办') + ' → ' + (st1 === 'done' ? '已完成' : '待办'))
    if (r1 && !dr.due) return { error: '重复得先有到期日 —— 上面把日期填上' }
    if (ch.length) {
      it.title = t1; it.due = dr.due || null; it.dom = dr.dom || null; it.status = st1
      it.repeat = r1 || null
      setQuad(it, q1)
      /* 在弹窗里把状态改成「已完成」和点勾选框是同一件事，重复的照滚 */
      if (st1 === 'done' && st0 !== 'done') rollRepeat(it)
    }
    target = t1
  } else {
    const nd = hit.node
    const t2 = String(dr.t || '').trim()
    if (!t2) return { error: ED.kind === 'habit' ? '习惯不能空' : '内容不能空' }
    if (nd.t !== t2) ch.push('内容「' + nd.t + '」→「' + t2 + '」')
    if ((nd.m || '') !== (dr.m || '')) ch.push((ED.kind === 'habit' ? '频率「' : '说明「') + (nd.m || '（空）') + '」→「' + (dr.m || '（空）') + '」')
    /* 提醒时间只对习惯有。比对用 remindTimeOf 而不是读 nd.rm ——
       nd.rm 可能是历史遗留的非法值（手改过档案），拿它比会在「本来就是空」
       的情况下多报一次改动，而写下去的是空。比的是**生效值**。 */
    if (ED.kind === 'habit') {
      const rm0 = remindTimeOf(nd), rm1 = String(dr.rm || '')
      if (rm0 !== rm1) ch.push('提醒 ' + (rm0 || '不提醒') + ' → ' + (rm1 || '不提醒'))
    }
    if (ch.length) {
      nd.t = t2; nd.m = dr.m
      /* 空串就把字段摘掉（和 bumpHabitLog 把 n 减回 1 时摘 n 同一个规矩：
         条目回到老档案的样子，导出去一个字节都不多）。
         dr.rm 在这里是**原样写**，不做正则过滤 —— 过滤是界面的事（picker 只能给
         合法值），数据层接受调用方显式给的时间串，好让对拍能拿任意串试。 */
      if (ED.kind === 'habit') {
        if (rm1) nd.rm = rm1
        else delete nd.rm
      }
    }
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

/* 两段确认的**通用**闸门：第一下只武装，第二下才执行 onConfirm。
 *
 * 泛化出来是因为「清空数据」和「恢复备份」也要同一套手势，但它们执行的
 * 不是什么 deleteNode 的 spec。原先那两个地方各自维护了一个 armed ref
 * 加一个定时器（clearArmed / bkArmed）—— 同一套交互三份实现，
 * 而且它们脱离了这里「全局同时只可能有一个待确认」的保证。
 *
 * 返回 null = 只是武装起来了；返回 onConfirm 的结果 = 真的执行了。 */
export function armConfirm(spec, onConfirm) {
  if (delArmed.value === spec) {
    disarmDelete()
    return onConfirm()
  }
  disarmDelete()
  delArmed.value = spec
  /* 比 3 秒长一点：手滑点歪了还能回来，但又不至于让人以为它在等一个决定 */
  delTimer = setTimeout(disarmDelete, 4000)
  return null
}

/* 返回 null = 只是武装起来了；返回对象 = 真的删了 */
export function armDelete(spec) { return armConfirm(spec, function () { return deleteNode(spec) }) }

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
  } else if (kind === 'trend') {
    /* 按 metric key 删，不按下标 —— 删掉中间一项之后下标整体错位，
       那是「确认删」武装着的那一项已经不是刚才点的那一项了 */
    const r = delTrend(key)
    if (!r) return { error: '这一项已经不在了' }
    done = { what: '趋势项', label: r.name, detail: '数据一条没动，只是不再单独看' }
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
