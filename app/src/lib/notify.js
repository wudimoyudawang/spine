/* 提醒的适配层：把数据层算出来的「未来几天该响哪几颗」交给原生。
 *
 * 依赖方向：views/components → lib（本文件）→ stores/db。单向。
 * 它只碰「交给系统」，不碰数据 —— 界面不该知道 Capacitor 的存在，
 * 数据层也不该知道（核心层不许依赖任何外部服务，见 README 硬约束 1）。
 * 所以这一层是**可缺席**的：没装壳、或者壳里没有那个插件，它整个沉默降级，
 * 应用功能一分不减，只是提醒那几处显示「只在 App 里生效」。
 *
 * 为什么不像 web-shim.js 那样直接调 Capacitor：
 *   web-shim 是**构建时拼进 index.html** 的一小段原生适配，它拿得到
 *   window.Capacitor 的加载时机；页面代码里直接写 window.Capacitor 的话，
 *   这段逻辑就和壳绑死了 —— 换成 DCloud 壳、或者以后做 PWA，
 *   要改的是业务代码而不是适配层。所以约定一个 **window.SPINE_NOTIFY** 钩子，
 *   和 SPINE_SAVE_FILE 同一个套路：页面只认「有没有那个钩子」。
 */
import { db, remindPlan, remindStats } from '../stores/db'

/* 原生注入的钩子。H5 开发环境、e2e、浏览器里都没有它 —— 那时提醒不可用。 */
function bridge() {
  if (typeof window === 'undefined') return null
  return window.SPINE_NOTIFY || null
}

/* 这台设备到底能不能发通知。
   注意它和「提醒开关开着没有」是两件事：开关是偏好，这个是能力。 */
export function notifySupported() {
  const b = bridge()
  return !!(b && typeof b.apply === 'function')
}

/* 上一次同步过去的排程特征。特征没变就不去烦原生 ——
   这个函数会在每次回到前台、每次打卡之后被叫，而绝大多数情况下
   未来 7 天的排程一个字都没变。
   （和 saveState 那条「先判断再付代价」是同一个思路。） */
let LAST_SIG = ''

function sigOf(list) {
  return list.map(function (o) { return o.id + '@' + o.at }).join(',')
}

/* 把当前排程同步给原生。**幂等**：同样的数据叫几次，系统里都是同一批通知，
   不多不少 —— 每次都是「先全部清掉、再按当前清单排一遍」。
   这样「用户把某个习惯的提醒关掉了」「今天已经打过卡了」这两件事
   都自然生效，不需要去算「该取消哪一颗」。
   原生那边能排的数量有上限，所以清单本身只有 7 天（见 remindPlan）。 */
export function syncReminders(force) {
  const b = bridge()
  if (!b || typeof b.apply !== 'function') return Promise.resolve({ supported: false })
  /* 开关关着 = 系统里不该留任何一颗。这里也要清，不能只「不排」——
     不然关掉开关之前排下的那些照样会响。 */
  if (!db.NOTIFY_ON) {
    if (LAST_SIG === '__off__' && !force) return Promise.resolve({ supported: true, cleared: true })
    LAST_SIG = '__off__'
    return Promise.resolve(b.apply([])).then(function () { return { supported: true, cleared: true } })
      .catch(function (e) { return { supported: true, error: errText(e) } })
  }
  const list = remindPlan(7)
  const sig = sigOf(list)
  if (sig === LAST_SIG && !force) return Promise.resolve({ supported: true, skipped: true, count: list.length })
  LAST_SIG = sig
  /* 只传原生需要的字段。extra 里带上 key，将来做「点通知直接打卡」要用 ——
     现在不做那个（点通知只是打开应用），但字段先留着不占地方。 */
  const payload = list.map(function (o) {
    return { id: o.id, at: o.at, title: o.title, time: o.time, key: o.key }
  })
  return Promise.resolve(b.apply(payload))
    .then(function (r) { return { supported: true, count: payload.length, native: r || null } })
    .catch(function (e) { return { supported: true, error: errText(e) } })
}

/* 权限：'granted' / 'denied' / 'prompt'。没有钩子时给 'unsupported'。 */
export function notifyPermission() {
  const b = bridge()
  if (!b || typeof b.check !== 'function') return Promise.resolve('unsupported')
  return Promise.resolve(b.check()).then(function (s) { return String(s || 'prompt') })
    .catch(function () { return 'prompt' })
}

/* 打开提醒：先要权限，拿到了才把开关打开。
   **顺序不能反**：反过来会出现「开关是开的、但系统里一颗都排不下」——
   屏幕上显示着「提醒已开」，实际不会响，是这台应用最不能出的那种错。 */
export function enableReminders() {
  const b = bridge()
  if (!b) return Promise.resolve({ error: '提醒只在装到手机上的 App 里生效' })
  return Promise.resolve(typeof b.request === 'function' ? b.request() : 'granted')
    .then(function (s) {
      if (String(s) !== 'granted') return { error: '系统没给通知权限，去手机的「设置 → 应用 → 书脊」里打开' }
      db.NOTIFY_ON = true
      LAST_SIG = ''            /* 强制重排：上次可能是在开关关着的时候算的 */
      return Promise.resolve(syncReminders(true)).then(function () { return { ok: true } })
    })
    .catch(function (e) { return { error: errText(e) } })
}

/* 关掉提醒：开关落下去，顺手把系统里已排的清掉。 */
export function disableReminders() {
  db.NOTIFY_ON = false
  return syncReminders(true).then(function () { return { ok: true } })
}

/* 当前状态，给设置页那一行用。 */
export function notifyState() {
  if (!notifySupported()) return Promise.resolve({ supported: false, on: false, perm: 'unsupported', count: remindStats().on })
  return notifyPermission().then(function (p) {
    return { supported: true, on: !!db.NOTIFY_ON, perm: p, count: remindStats().on }
  })
}

/* 权限的界面用语。放在这里而不是页面里 —— 三处都会用到同一句。 */
export function permLabel(perm) {
  if (perm === 'granted') return '已允许'
  if (perm === 'denied') return '已被拒绝'
  return '还没申请'
}

function errText(e) {
  return (e && (e.message || e.errorMessage)) || String(e || '未知错误')
}
