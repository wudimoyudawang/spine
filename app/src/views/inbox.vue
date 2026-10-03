<template>
  <view class="page">
    <PageHead title="收集" />
    <!-- 收集 / 随心记。这两个本来并肩占底栏两格，2026-10-04 并成了一格 ——
         它们压根是同一件事的两种形态：都是「先记下来，回头再说」。
         腾出来的那一格给了记账。 -->
    <ViewSeg group="box" />

    <!-- ============ 记东西 ============
         这一块原来是一个**弹层**（`components/CaptureSheet.vue`，底栏正中那颗加号点开）。
         2026-10-04 宇要求「加号的功能放到收集页面里面」 ——
         于是它整块搬到这儿，弹层那一层**删掉了**。

         为什么它长在收集页上是顺的：加号那件事本来就是「先记下来」，
         而「收集」这一格存在的理由也是「先记下来，回头再归类」。
         底栏正中那格的位置也没变 —— 原来是加号，现在是收集。

         ⚠️ **只在「收集」镜头上铺**：随心记那一档有它自己的零字段大框，
         两个框摆在一页上会打架（写同样一句话，一个进收件箱、一个进随心记）。 -->
    <view v-if="db.CURRENT === 'inbox'" class="cap">
      <view class="cap-row">
        <input :maxlength="-1"
          v-model="draft"
          class="capin"
          :focus="focused"
          placeholder="想记什么就写什么：事情、金额、热量、体重、一句话"
          confirm-type="done"
          @confirm="submit"
        />
        <view class="cap-go" @click="submit"><text class="cap-go-t">记下</text></view>
      </view>

      <!-- 提交之前先说一遍会记成什么。看不见它命中哪条规则，就等于没写对。
           它是 `resolveCapture` 的又一次调用，不是第二套判断。 -->
      <view v-if="preview" class="capres">
        <text class="capres-k">会记成 </text>
        <text class="capres-v">{{ preview.describe }}</text>
        <text v-if="preview.hit" class="capres-hit">· 命中「{{ preview.hit }}」</text>
      </view>

      <!-- 常用短语：记过的东西，点一下填进来。只在有候选时出现，
           打一个字就会按「带这些字的」重排，空输入时给最近最常记的。 -->
      <view v-if="phrases.length" class="phrases">
        <view v-for="p in phrases" :key="p" class="pchip" @click="draft = p">
          <text class="pchip-t">{{ p }}</text>
        </view>
      </view>

      <!-- 模式胶囊自动换行，不横滑：这一排就是「现在能记什么」的清单，
           藏起来一半等于没有。「自定义」跟在末尾一起换行 ——
           它本来就是这一排的最后一个动作。 -->
      <view class="modes">
        <view
          v-for="m in modes"
          :key="m.k"
          class="mchip"
          :class="{ 'is-on': mode === m.k }"
          @click="mode = m.k"
        >
          <text class="mchip-t">{{ m.t }}</text>
        </view>
        <view class="morebtn" :class="{ 'is-on': showAll }" @click="showAll = !showAll">
          <text class="morebtn-t">自定义</text>
        </view>
      </view>

      <!-- 展开的是「空间里所有能记的东西」。每行两个控制：
           左边的上下箭头管顺序（就是上面那排的真实次序），右边的开关管它进不进那排。
           关掉的仍然留在列表里、只是变淡 —— 否则关掉之后就再也找不回来了。 -->
      <view v-if="showAll" class="allbox">
        <view v-for="(o, i) in allOptions" :key="o.k" class="allrow" :class="{ 'is-off': !o.on }">
          <view class="arw">
            <view class="arw-b" :class="{ 'is-dim': !canUp(i) }" @click="move(o, -1)">
              <view class="tri tri-up"></view>
            </view>
            <view class="arw-b" :class="{ 'is-dim': !canDown(i) }" @click="move(o, 1)">
              <view class="tri tri-dn"></view>
            </view>
          </view>
          <view class="allrow-m" @click="pickOption(o)">
            <text class="allrow-t" :class="{ 'is-on': mode === o.k }">{{ o.t }}</text>
            <text class="allrow-s">{{ sub(o) }}</text>
          </view>
          <view class="sw sw-row" :class="{ 'is-on': o.on }" @click="toggleOpt(o)">
            <view class="sw-dot"></view>
          </view>
        </view>
        <!-- 挪乱了想回到初始样子，不用一个个点回去 -->
        <view class="allreset" @click="resetCfg"><text class="allreset-t">恢复默认</text></view>
      </view>
    </view>

    <!-- ============ 收件箱 ============ -->
    <view class="block">
      <view class="block-h">
        <text class="tag">收件箱</text>
        <text class="block-note">{{ db.INBOX.length ? (db.INBOX.length + ' 条待归类') : '空的' }}</text>
      </view>
      <view v-if="!db.INBOX.length" class="empty">
        <text class="empty-t">收件箱是空的。它只管「先记下来，别丢」。</text>
      </view>
      <view v-for="it in db.INBOX" :key="it.id">
        <view class="row">
          <view class="row-main">
            <text class="row-t">{{ it.text }}</text>
            <text class="row-m">记于 {{ fmtCN(it.at) }} · 没有领域</text>
          </view>
          <view class="chip" :class="{ 'is-on': open === it.id }" @click="toggle(it.id)">
            <text class="chip-t">{{ open === it.id ? '收起' : '归类' }}</text>
          </view>
          <view class="delbtn" :class="{ 'is-armed': armed === 'inbox:' + it.id }" @click="del(it)">
            <text class="delbtn-t" :class="{ 'is-armed': armed === 'inbox:' + it.id }">{{ armed === 'inbox:' + it.id ? '确认删' : '×' }}</text>
          </view>
        </view>
        <!-- 去处就摊在这一行下面：看完这句要挑的是哪一格，不用抬头找标题 -->
        <view v-if="open === it.id" class="clsbox">
          <text class="cls-k">归到：</text>
          <view
            v-for="o in places"
            :key="o.v"
            class="chip chip-sm"
            @click="classify(it, o.v)"
          >
            <text class="chip-t">{{ o.t }}</text>
          </view>
          <!-- 归成待办时落到哪天：默认今天，可改到任意一天，也可以不限
               （不限 = 不带日期，只躺在领域页，不进今日页）。
               随心记没有日期，这两颗对它不起作用。 -->
          <picker
            mode="date"
            :value="clsDate === 'none' ? TODAY : (clsDate || TODAY)"
            @change="pickDate"
          >
            <view class="chip chip-sm chip-date">
              <text class="chip-t">落到 {{ dateLabel }}</text>
            </view>
          </picker>
          <view class="chip chip-sm" @click="toggleNone">
            <text class="chip-t" :class="{ 'is-none': clsDate === 'none' }">{{ clsDate === 'none' ? '选个日子' : '不限' }}</text>
          </view>
        </view>
      </view>
      <view v-if="db.INBOX.length" class="note">
        <text class="note-t">归类就是把它变成别处的正经条目，然后从这里消失。</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  db, fmtCN, TODAY, money, addInbox, classifyInbox, delArmed, saveState,
  addMoney, addTodo, addNote, addRecord,
  resolveCapture, describeCapture, ruleName, recentPhrases,
  allCaptureOptions, commonCaptureOptions, moveCaptureOption, toggleCaptureCommon,
  resetCaptureConfig
} from '../stores/db'
import PageHead from '../components/PageHead.vue'
import ViewSeg from '../components/ViewSeg.vue'
import { toast, confirmDelete } from '../lib/ui'

/* ================= 记东西 =================
 * 这一整块原来住在 `components/CaptureSheet.vue`（底栏正中那颗加号点开的弹层）。
 * 搬到页面上之后，只有两件事变了：
 *   · 「记完自动关」那个开关**没了** —— 没有面板可关（`db.CAP_AUTO_CLOSE` 一起删掉）
 *   · 默认模式从「自动判断」改成**「只丢进收件箱」**（宇定的）：
 *     进收集页的第一意图就是「先存着」。想让它判成待办 / 热量 / 体重就点胶囊。
 * 其余判断逻辑一行没动 —— 同一个 `resolveCapture()`，同一份 `CAP_CFG` 偏好。
 */

const draft = ref('')
/* 默认「只丢进收件箱」。**不记住上一次**：留着选中态的话，下一句忘了看
   就会被记到上一句选的类目里，那种错在界面上看不出来，比不选更糟。 */
const mode = ref('inbox')
const focused = ref(false)
const showAll = ref(false)

/* 那一排胶囊 = 在自定义里开着的那几个。
   顺序也来自那儿：列表里怎么排，这一排就怎么排，中间不做映射。 */
const modes = computed(function () { return commonCaptureOptions() })

/* 常用短语：跟着你当前打的字走。空输入给「最近最常记的」，打了字就给你
   记过的、带这些字的短语。记下一条新内容后，它下次就会出现 —— 越用越准。 */
const phrases = computed(function () { return recentPhrases(draft.value, 6) })

/* 「自定义」里展开的全部：空间里所有能记的东西 */
const allOptions = computed(function () { return allCaptureOptions() })

function sub(o) {
  if (o.builtin) return o.group
  return o.group + (o.unit ? ' · ' + o.unit : '')
}

/* 只写了一半的那句话也能看出结果，不用先提交再后悔。
   它是 resolveCapture 的又一次调用，不是另一套判断 —— 同一数字只允许一处算法。 */
const preview = computed(function () {
  const t = draft.value.trim()
  if (!t) return null
  const r = resolveCapture(t, mode.value)
  return { describe: describeCapture(r), hit: r.rule ? ruleName(r.rule) : '' }
})

/* 万一用户在「自定义」里把「只丢进收件箱」关了，就落回第一颗可见的 ——
   界面上没有一颗选中、而预览说「会记成 收件箱」，正是那种「说了不算」的味道。 */
watch(modes, function (list) {
  if (list.some(function (m) { return m.k === mode.value })) return
  mode.value = list.length ? list[0].k : 'inbox'
})

/* 能不能往这个方向挪。锁住的不动，也不能越过锁住的 —— 「自动判断」占着第一位。 */
function canUp(i) {
  const L = allOptions.value
  return i > 0 && !L[i].lock && !L[i - 1].lock
}
function canDown(i) {
  const L = allOptions.value
  return i < L.length - 1 && !L[i].lock && !L[i + 1].lock
}

function move(o, d) {
  if (o.lock) { toast('「自动判断」固定在第一位'); return }
  if (!moveCaptureOption(o.k, d)) return
  /* 挪完立刻落盘，不等那个 2 秒的定时器 —— 人可能配完就切走 */
  saveState(true)
}

/* 名字叫 toggleOpt 不叫 toggle：这一页里 `toggle(id)` 已经被**归类面板**占了
   （点「归类」展开/收起），两个函数同名会让 SFC 编译直接报
   「Identifier 'toggle' has already been declared」。 */
function toggleOpt(o) {
  if (o.lock) { toast('「自动判断」是默认项，一直都在'); return }
  const on = toggleCaptureCommon(o.k)
  if (!on && mode.value === o.k) mode.value = 'inbox'
  saveState(true)
}

function resetCfg() {
  resetCaptureConfig()
  saveState(true)
  toast('回到默认')
}

function pickOption(o) {
  mode.value = o.k
  showAll.value = false
  refocus()
}

/* 进这一格就聚焦。**先放掉再拿起**：不做出 false → true 的跳变，
   第二次进来时光标不会进来（focus 一直是 true）。
   聚焦是「3 步记下来」这条验收标准的一部分：点「收集」（1）→ 打字（2）→
   记下（3）。不聚焦就多一步「点一下输入框」。 */
function refocus() {
  focused.value = false
  nextTick(function () { focused.value = true })
}
onMounted(refocus)          /* 冷启动落在这一页时也要聚焦 */
watch(() => db.CURRENT, function (v) { if (v === 'inbox') refocus() })

function submit() {
  const t = draft.value.trim()
  if (!t) return
  /* 预览那行和这里落库走的是同一个 resolveCapture()，
     所以「会记成什么」不会说了不算。 */
  const r = resolveCapture(t, mode.value)

  if (r.kind === 'rt') {
    if (r.rt.mode === 'number' && r.value === null) {
      toast('「' + r.rt.name + '」要个数字')
      return
    }
    addRecord(r.rt.id, r.rt.mode === 'number' ? r.value : r.text)
    toast('记进「' + r.rt.name + '」')
    draft.value = ''
    return
  }
  if (r.kind === 'money') {
    if (r.value === null) {
      toast('记支出要先写个金额')
      return
    }
    addMoney(r.value, r.text, r.category)
    toast('记下 ' + money(r.value) + (r.category ? ' · ' + r.category : ''))
    draft.value = ''
    return
  }
  if (r.kind === 'todo') {
    /* r.text 是去掉日期短语之后的正文（「明天交周报」→「交周报」），
       r.due 是解析出来的到期日；没有日期词时 due 为空 → addTodo 落到今天 */
    addTodo(r.text || t, '', r.due || undefined)
    toast(r.due ? '待办 · ' + (r.due === TODAY ? '今天' : fmtCN(r.due)) : '记成待办')
    draft.value = ''
    return
  }
  if (r.kind === 'note') { addNote(t); toast('记进随心记了'); draft.value = ''; return }
  if (r.kind === 'inbox') { addInbox(t); toast('丢进收件箱了'); draft.value = ''; return }
  /* 兜底：一个都没落上也不能什么都不做 —— 提交了一次没反应，比记错地方更糟。 */
  addInbox(t)
  toast('先进收件箱，回头再归')
  draft.value = ''
}

/* ================= 收件箱 ================= */
const open = ref('')
const armed = delArmed

/* 去处：两个固定的 + 每个领域一格。领域改名、加领域都跟着这份走。
   「先留着」不算去处，它只是把这一排收起来 —— 所以单独一颗，不混在里面。 */
const places = computed(function () {
  const out = [{ v: 'todo', t: '待办' }, { v: 'note', t: '随心记' }]
  for (const d of db.DOMAINS) out.push({ v: d.id, t: d.name })
  out.push({ v: '', t: '先留着' })
  return out
})

/* 归类落到哪天：'' = 今天（默认），具体日期 = 那一天，'none' = 不限。
   面板每打开一次就回到今天 —— 上一次选的日子不该偷偷沿用，
   「归到今天」永远是这一栏最常见的目的地。 */
const clsDate = ref('')

const dateLabel = computed(function () {
  if (clsDate.value === 'none') return '不限'
  if (!clsDate.value || clsDate.value === TODAY) return '今天'
  return fmtCN(clsDate.value)
})
function pickDate(e) {
  const v = e && e.detail ? e.detail.value : ''
  clsDate.value = !v || v === TODAY ? '' : v
}
function toggleNone() {
  clsDate.value = clsDate.value === 'none' ? '' : 'none'
}

function toggle(id) {
  if (open.value === id) { open.value = ''; return }
  open.value = id
  clsDate.value = ''
}

function classify(it, to) {
  if (!to) { open.value = ''; return }
  /* 'none' → null（明确不限）；'' → undefined（数据层的老行为：待办今天、领域不限） */
  const d = clsDate.value === 'none' ? null : (clsDate.value || undefined)
  const r = classifyInbox(it.id, to, d)
  open.value = ''
  if (r.error) { toast(r.error); return }
  saveState(true)
  toast('已归到 ' + r.where)
}

/* 删和别处同一套两段确认（闸门在数据层，提示与存盘走 lib/ui 那一处）。
   以前这里弹一个系统对话框 —— 两种删除手势混在一个应用里，
   人会以为自己点错了地方。 */
function del(it) {
  const r = confirmDelete('inbox:' + it.id)
  if (r.armed || r.error) { if (r.msg) toast(r.msg); return }
  if (open.value === it.id) open.value = ''
  toast('已删除')
}
</script>

<style scoped>
/* ================= 记东西那一块 =================
 * 这一整套类名是从 `components/CaptureSheet.vue` 搬过来的，尺寸基本没动 ——
 * 那边按「一个紧凑的弹层」调的，摆到页面上同样是「一块紧凑的输入区」。
 * 唯一的改动是「记下」从整行大钮缩成输入框右边那一颗：
 * 弹层里它在整块的最下面（手指够得着），页面上输入框在顶上，
 * 把它留在最下面等于每次记一笔都要把拇指再往下够一次。 */
.cap {
  margin-bottom: 14px;
  padding: 10px 12px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.cap-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.capin {
  flex: 1 1 auto;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.cap-go {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  margin-left: 8px;
  padding: 0 14px;
  background: var(--accent);
  border-radius: 9px;
}
.cap-go-t { color: #fff; font-size: 14px; }
.cap-go:active { background: #2A63D2; }

/* 预览那行。字比输入框小一档：它是说明，不是内容。 */
.capres {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 7px;
  padding: 0 2px;
}
.capres-k { font-size: 11px; color: var(--muted); }
.capres-v { font-size: 11px; font-weight: 500; color: var(--text); }
.capres-hit { margin-left: 4px; font-size: 11px; color: var(--accent); }

/* 常用短语那排。小一号、可换行 —— 它是「给你填的提示」，不是主内容，
   不能抢输入框的注意力；但也得一眼扫得到、点得到。 */
.phrases {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  margin-top: 6px;
}
.pchip {
  margin: 0 6px 6px 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--line);
}
.pchip-t { font-size: 12px; color: var(--sub); }
.pchip:active { background: var(--line); }

/* 胶囊自动换行。原来是一行横滑（scroll-view + nowrap），
   放不下的要滑了才看得到 —— 这一排是「现在能记什么」的清单，
   藏起来一半的话，人只会用他看得见的那几种。 */
.modes {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 8px;
}
.mchip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 14px;
  margin: 0 8px 6px 0;
  border-radius: 15px;
  background: var(--bg);
}
.mchip-t { font-size: 12px; color: var(--sub); }
.mchip.is-on { background: var(--accent); }
.mchip.is-on .mchip-t { color: #fff; }

.morebtn {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  margin: 0 0 6px 0;
  padding: 0 12px;
  border: 1px solid var(--line2);
  border-radius: 15px;
}
.morebtn-t { font-size: 12px; color: var(--sub); }
.morebtn.is-on { border-color: var(--accent); }
.morebtn.is-on .morebtn-t { color: var(--accent); }

/* 自定义展开的列表。在弹层里它自己有 max-height 内部滚；
   在页面上不用了 —— 整页本来就滚，两层各滚各的滚轮会打架。 */
.allbox {
  margin-top: 4px;
  padding: 2px 0;
  background: var(--bg);
  border-radius: 10px;
}
.allrow {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 5px 10px 5px 4px;
}
/* 关掉的变淡，但**不从列表里拿掉** —— 否则关掉之后就再也找不回来了 */
.allrow.is-off .allrow-t { color: var(--muted); }

/* 左边那对上下箭头：调的就是上面那排的真实次序 */
.arw {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 26px;
  margin-right: 2px;
}
.arw-b {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  border-radius: 5px;
}
.arw-b:active { background: var(--line); }
.arw-b.is-dim:active { background: transparent; }
/* 三角形用边框画，不用 ▲▼ 字符：字符的字形各机型不一致，会看着歪 */
.tri {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
}
.tri-up { border-bottom: 5px solid var(--sub); }
.tri-dn { border-top: 5px solid var(--sub); }
.arw-b.is-dim .tri { opacity: .25; }

.allrow-m {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 3px 10px 3px 2px;
}
.allrow-t { font-size: 13px; color: var(--text); }
.allrow-t.is-on { color: var(--accent); }
.allrow-s { font-size: 11px; color: var(--muted); }

/* 列表行里的开关比弹层顶部那个小一号的规格 */
.sw {
  position: relative;
  width: 36px;
  height: 21px;
  border-radius: 11px;
  background: var(--line2);
}
.sw.is-on { background: var(--accent); }
.sw-dot {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #fff;
}
.sw.is-on .sw-dot { left: 18px; }
.sw-row {
  flex: 0 0 auto;
  width: 34px;
  height: 20px;
  border-radius: 10px;
}
.sw-row .sw-dot { top: 3px; left: 3px; width: 14px; height: 14px; }
.sw-row.is-on .sw-dot { left: 17px; }

.allreset {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  margin: 6px 10px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.allreset-t { font-size: 12px; color: var(--sub); }
.allreset:active { background: var(--line); }

/* ================= 收件箱 ================= */
.block {
  padding: 10px 14px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.block-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 6px;
}

.chip {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 5px 12px;
  margin-left: 8px;
  border: 1px solid var(--line2);
  border-radius: 999px;
}
.chip-t { font-size: 12px; color: var(--sub); }
.chip:active { background: var(--bg); }
/* 面板开着的时候那颗要看得出来是它开的，不然那一排去处像凭空冒出来的 */
.chip.is-on { background: var(--accent-bg); border-color: var(--accent); }
.chip.is-on .chip-t { color: var(--accent); }

/* 去处那一排：紧跟在这条下面，小一号 —— 它是一次选择，不是行上的主钮 */
.clsbox {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  padding: 2px 0 10px;
  border-top: 1px solid var(--line);
}
.cls-k { font-size: 12px; color: var(--muted); }
.clsbox .chip { margin: 6px 0 0 6px; min-height: 26px; padding: 4px 10px; }
/* 日期那颗：底色跟别的 chip 区分开 —— 它不是「归到哪」，是「落到哪天」，
   是归到待办时的一个修饰。虚线边框也是这个意思。 */
.chip-date { background: var(--accent-bg); border: 1px dashed var(--accent); }
.chip-t.is-none { color: var(--muted); }
.delbtn:active { background: var(--bg); }

.note { padding-top: 10px; }
.note-t { font-size: 12px; line-height: 1.5; color: var(--muted); }

.empty { padding: 12px 0 16px; }
.empty-t { font-size: 13px; line-height: 1.5; color: var(--muted); }
</style>
