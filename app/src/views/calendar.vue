<template>
  <view class="page">
    <PageHead title="日历" :sub="headSub" />
    <ViewSeg />

    <!-- 月 / 周 + 翻页。月周放在这一行而不是另起一行：
         它是「同一个日历的两种密度」，和翻页是同一件事的两个控件。 -->
    <view class="topbar">
      <view class="seg seg-sm">
        <view class="seg-b" :class="{ 'is-on': mode === 'month' }" @click="setMode('month')">
          <text class="seg-t">月</text>
        </view>
        <view class="seg-b" :class="{ 'is-on': mode === 'week' }" @click="setMode('week')">
          <text class="seg-t">周</text>
        </view>
      </view>
      <view class="nav-b" @click="shift(-1)"><text class="nav-t">‹</text></view>
      <text class="topbar-l">{{ label }}</text>
      <!-- 回今天放在 › 左边：它和 › 都是「往现在的方向去」的动作，
           挨在一起才读得通。放在最右边的话，会像是这个顶栏的第四个孤立控件。 -->
      <view v-if="showNow" class="now-b" @click="toToday"><text class="now-t">回今天</text></view>
      <view class="nav-b" @click="shift(1)"><text class="nav-t">›</text></view>
    </view>

    <!-- 月：一整个月的网格 -->
    <template v-if="mode === 'month'">
      <view class="wk">
        <text v-for="w in WEEK" :key="w" class="wk-t">{{ w }}</text>
      </view>
      <view class="grid">
        <view
          v-for="c in mv.cells"
          :key="c.iso"
          class="cell"
          :class="{ 'is-out': !c.inMonth, 'is-sel': c.iso === sel, 'is-today': c.today }"
          @click="sel = c.iso"
        >
          <text class="cell-d">{{ c.day }}</text>
          <view class="cell-m">
            <!-- 没做完的待办给数字，别的只给点。数字比点多一层信息：
                 一眼能看出「哪天堆着事」，而不是只知道「那天有东西」。 -->
            <view v-if="c.open" class="pill" :class="{ 'is-late': c.iso < TODAY }">
              <text class="pill-t">{{ c.open }}</text>
            </view>
            <view v-if="c.habit" class="dot dot-h"></view>
            <view v-if="c.money || c.rt" class="dot dot-m"></view>
          </view>
          <!-- 当天花了多少。没有支出的日子这行留空但仍然占位，
               否则那一行的格子会矮一截，整个网格看上去像拼错的。 -->
          <text class="cell-a">{{ c.inMonth && c.money ? money(c.money) : '' }}</text>
        </view>
      </view>

      <!-- 那三个点的意思不写出来就得靠猜。一行，很小，不点。 -->
      <view class="legend">
        <view class="pill is-late"><text class="pill-t">2</text></view>
        <text class="lg-t">欠着的待办</text>
        <view class="dot dot-h"></view>
        <text class="lg-t">打卡</text>
        <view class="dot dot-m"></view>
        <text class="lg-t">记账 / 记录</text>
      </view>
    </template>

    <!-- 周：账单在顶端（宇定的）—— 周视图七天的卡片本来就长，
         账单压在底下要滚到底才看得见，而「这一周花了多少」是打开就想看的那个数。 -->
    <template v-else>
      <BillBar :bill="bill" :name="periodName" :prev-name="period.prevName" />

      <view
        v-for="d in wv.days"
        :key="d.iso"
        class="wday"
        :class="{ 'is-today': d.today, 'is-sel': d.iso === sel }"
      >
        <view class="wday-h" @click="sel = d.iso">
          <text class="wday-d" :class="{ 'is-today': d.today }">{{ d.today ? '今天 · ' : '' }}周{{ d.w }} {{ d.d }}</text>
          <text class="wday-n">{{ dayNote(d) }}</text>
        </view>
        <view v-for="r in d.rows" :key="r.node.id" class="row" @click="edit(r.spec)">
          <DoneBox :on="false" @toggle="toggleDone(r.node)" />
          <view class="row-main">
            <text class="row-t">{{ r.node.title }}</text>
            <text class="row-m" :class="{ 'is-late': isLate(r) }">{{ pathPre(r) }}{{ domainName(r.node) }}{{ lateOf(r) }}</text>
          </view>
        </view>
      </view>
    </template>

    <!-- 账单：月视图放在网格下面。周视图的那条在顶端（见上面）——
         同一条数据、同一个组件，只是两个密度里各自待在该待的位置。 -->
    <BillBar v-if="mode === 'month'" :bill="bill" :name="periodName" :prev-name="period.prevName" />

    <!-- 月模式下点开的那一天。周模式不用这一块 —— 那天的事已经列在上面了。
         一天的事收成**一块**，从上到下固定是 记账 → 待办 → 打卡 → 记录（宇定的顺序）。
         原来「待办」和「那天还留下了」是两块：同一天的东西要来回翻才凑得齐，
         而且「还留下了」这个标题也没说清它和上面那块是不是同一天。 -->
    <template v-if="mode === 'month'">
      <view class="block">
        <view class="block-h">
          <text class="tag">{{ selLabel }}</text>
          <text class="block-note">{{ selNote }}</text>
        </view>

        <!-- 记账。每一笔都列出来（分类 + 金额），合计放在标题右边 ——
             只给合计的话看不出钱花在哪，还得再去记账页翻一遍。 -->
        <view class="sec">
          <view class="sec-h">
            <text class="sec-k">记账</text>
            <text class="sec-n">{{ marks.moneyCount ? money(marks.moneySum) + ' · ' + marks.moneyCount + ' 笔' : '' }}</text>
          </view>
          <view v-if="!marks.moneyList.length" class="sec-e"><text class="sec-e-t">这天没记</text></view>
          <view v-for="(x, i) in marks.moneyList" :key="'m' + i" class="secrow">
            <text class="secrow-k">{{ x.category }}</text>
            <text class="secrow-v">{{ money(x.value) }}</text>
          </view>
        </view>

        <!-- 待办 -->
        <view class="sec">
          <view class="sec-h">
            <text class="sec-k">待办</text>
            <text class="sec-n">{{ selRows.length ? selNote : '' }}</text>
          </view>
          <view v-if="!selRows.length" class="sec-e">
            <text class="sec-e-t">这天没有到期的待办</text>
          </view>
          <view v-for="r in selRows" :key="r.node.id" class="row" @click="edit(r.spec)">
            <DoneBox :on="r.node.status === 'done'" @toggle="toggleDone(r.node)" />
            <view class="row-main">
              <text class="row-t" :class="{ 'is-done': r.node.status === 'done' }">{{ r.node.title }}</text>
              <text class="row-m" :class="{ 'is-late': isLate(r) }">{{ pathPre(r) }}{{ domainName(r.node) }}{{ lateOf(r) }}</text>
            </view>
          </view>
        </view>

        <!-- 习惯打卡。一天打了几个列几个，名字就是习惯本身的名字。 -->
        <view class="sec">
          <view class="sec-h"><text class="sec-k">打卡</text></view>
          <view v-if="!marks.habits.length" class="sec-e"><text class="sec-e-t">这天没打</text></view>
          <view v-for="(h, i) in marks.habits" :key="'h' + i" class="secrow">
            <text class="secrow-k">{{ h }}</text>
            <text class="secrow-v is-ok">已打卡</text>
          </view>
        </view>

        <!-- 记录项（热量、体重这类）。不是每天都有，有才出现 ——
             给它留一个常驻的空位，等于每天都在提醒「你还有个没填的」。 -->
        <view v-if="marks.rts.length" class="sec">
          <view class="sec-h"><text class="sec-k">记录</text></view>
          <view v-for="(x, i) in marks.rts" :key="'rt' + i" class="secrow">
            <text class="secrow-k">{{ x.name }}</text>
            <text class="secrow-v">{{ x.v }}{{ x.unit }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  TODAY, money, weekdayCN, dayCount, domainName, saveState, openEdit,
  monthView, dayRows, dayMarks, weekView, moneyBrief,
  shiftMonths, shiftWeeks, shiftDays, startOfWeek, endOfMonth, rollRepeat
} from '../stores/db'
import PageHead from '../components/PageHead.vue'
import ViewSeg from '../components/ViewSeg.vue'
import DoneBox from '../components/DoneBox.vue'
import BillBar from '../components/BillBar.vue'

/* 周一起头 —— 和 startOfWeek 一个口径。周日开头的话，「这一周」在最常看的那两天
   会显得短一截（见 db.js 里 startOfWeek 那段）。 */
const WEEK = ['一', '二', '三', '四', '五', '六', '日']

/* mode / anchor / sel 都是**这一页自己的事**，不进 db：
   日历不是「我记了什么」，是「我此刻在看哪儿」。切走再回来重开本期、选中今天；
   停在三个月前才叫奇怪。

   为什么只留一个 anchor：月和周是同一个位置的两个密度，不是两个地方。
   切模式时把 anchor 收到 sel（你正看着的那一天）所在的期 —— 见 setMode。 */
const mode = ref('month')
const anchor = ref(TODAY)
const sel = ref(TODAY)

const mv = computed(function () { return monthView(anchor.value) })
const wv = computed(function () { return weekView(anchor.value) })

const selRows = computed(function () { return dayRows(sel.value) })
const marks = computed(function () { return dayMarks(sel.value) })

const isCurrent = computed(function () {
  if (mode.value === 'week') return wv.value.lead === startOfWeek(TODAY)
  return anchor.value.slice(0, 7) === TODAY.slice(0, 7)
})

/* 什么时候给「回今天」。**只看期不够**：停在 10 月当然要给，
   但留在 9 月、点中了 5 号的那天，同样需要一颗能回去的钮 ——
   不给的话，那颗选中态就成了走不出去的地方。所以选中的日子不是今天也要给。 */
const showNow = computed(function () {
  return sel.value !== TODAY || !isCurrent.value
})

const label = computed(function () {
  if (mode.value === 'month') return mv.value.label
  const a = wv.value.lead.split('-').map(Number)
  const b = wv.value.last.split('-').map(Number)
  if (a[1] === b[1]) return a[1] + ' 月 ' + a[2] + ' 日 – ' + b[2] + ' 日'
  return a[1] + ' 月 ' + a[2] + ' 日 – ' + b[1] + ' 月 ' + b[2] + ' 日'
})

/* 副标题跟着**正在看的这一期**走，不是跟着今天走 ——
   翻到上个月时上面还写「本月」，会让人以为翻页没生效。 */
const headSub = computed(function () {
  if (mode.value === 'week') {
    let open = 0, done = 0
    for (const d of wv.value.days) { open += d.rows.length; done += d.done }
    return open + ' 件没做完 · 已做 ' + done + ' 件'
  }
  return mv.value.mOpen + ' 件没做完 · 已做 ' + mv.value.mDone + ' 件'
})

/* ---- 账单那一期 ---- */
const period = computed(function () {
  if (mode.value === 'week') {
    const from = wv.value.lead, to = wv.value.last
    return {
      from, to,
      pf: shiftDays(from, -7), pt: shiftDays(to, -7),
      name: from === startOfWeek(TODAY) ? '本周' : '这一周',
      prevName: '上周'
    }
  }
  const first = mv.value.first
  const prevFirst = shiftMonths(first, -1)
  return {
    from: first, to: endOfMonth(first),
    pf: prevFirst, pt: endOfMonth(prevFirst),
    name: mv.value.first.slice(0, 7) === TODAY.slice(0, 7) ? '本月' : mv.value.m + ' 月',
    prevName: '上月'
  }
})

const bill = computed(function () {
  const p = period.value
  return moneyBrief(p.from, p.to, p.pf, p.pt)
})

const periodName = computed(function () { return period.value.name })

/* 分类前几名、「其余 N 类」、和上一期的差额与措辞，都搬进 components/BillBar.vue 了 ——
   周视图和月视图各渲染一条，两处各抄一份的话，改一处另一处就对不上。 */

const selLabel = computed(function () {
  const p = sel.value.split('-').map(Number)
  return p[1] + ' 月 ' + p[2] + ' 日 · 周' + weekdayCN(sel.value)
})

const selNote = computed(function () {
  if (!selRows.value.length) return ''
  const open = selRows.value.filter(function (r) { return r.node.status !== 'done' }).length
  const done = selRows.value.length - open
  return open + ' 条没做完' + (done ? ' · ' + done + ' 条已完成' : '')
})

function setMode(m) {
  if (mode.value === m) return
  mode.value = m
  /* 切密度时定位到「你正看着的那一天」所在的期。
     用 anchor 直接换算的话，月视图停在 9 月 1 号、切到周视图会跳到 8 月底那一周 ——
     那不是人想看的东西。 */
  anchor.value = sel.value
}

function shift(n) {
  anchor.value = mode.value === 'month' ? shiftMonths(anchor.value, n) : shiftWeeks(anchor.value, n)
  /* 月模式换月时把选中日挪到那个月 1 号。不挪的话，下面两块还在显示上个月某一天的事，
     而格子已经换了一屏 —— 看着像是点错了。
     周模式不挪：那一周七天的标题都在屏幕上，选中哪天不影响上面的内容。 */
  if (mode.value === 'month') sel.value = anchor.value
}

function toToday() { anchor.value = TODAY; sel.value = TODAY }

function pathPre(r) { return r.path ? r.path + ' · ' : '' }

/* 逾期与否按**这一条自己的到期日**算，不看它在哪一天出现 ——
   一条子项挂在逾期的父项下面、但自己到期日是今天，那种情况不该写「逾期」。 */
function isLate(r) {
  return !!r.node.due && r.node.status !== 'done' && r.node.due < TODAY
}
function lateOf(r) {
  if (!isLate(r)) return ''
  return ' · ' + r.node.due.slice(5) + ' 到期 · 逾期 ' + dayCount(r.node.due, TODAY) + ' 天'
}

/* 周视图每天标题右边那一小句。没有待办也没有痕迹的日子只给一个「—」，
   不留空行 —— 空着看不出来是「那天没事」还是「下面那块没渲染」。 */
function dayNote(d) {
  const p = []
  if (d.rows.length) p.push(d.rows.length + ' 件')
  if (d.done) p.push('已做 ' + d.done)
  if (d.habit) p.push('打卡 ' + d.habit)
  if (d.moneySum) p.push('支出 ' + money(d.moneySum))
  return p.length ? p.join(' · ') : '—'
}

function edit(spec) {
  const r = openEdit(spec)
  if (r && r.error) uni.showToast({ title: r.error, icon: 'none' })
}

/* 勾选：点一下完成，再点一下取消。和今日页同一条 —— 能反悔是有意做的。 */
function toggleDone(it) {
  const wasDone = it.status === 'done'
  it.status = wasDone ? 'todo' : 'done'
  let rolled = null
  if (!wasDone) rolled = rollRepeat(it)
  saveState()
  uni.showToast({
    title: wasDone ? '取消完成' : (rolled ? '完成了 · 下一次已排到 ' + rolled.due : '完成了'),
    icon: 'none'
  })
}
</script>

<style scoped>
.page { padding: 14px 14px calc(76px + env(safe-area-inset-bottom)); }

/* ---- 月/周 与 翻页 ---- */
.topbar {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 9px;
}
/* 复用 .seg（base.scss），只改宽度：两个字的钮没必要占满一行 */
.seg-sm { flex: none; width: 94px; }
.seg-sm .seg-b { min-height: 30px; }
.nav-b {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-left: 6px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  background: var(--card);
}
.nav-t { font-size: 16px; line-height: 1; color: var(--sub); }
.nav-b:active { background: var(--bg); }
.topbar-l {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 8px;
  font-size: 14px;
  color: var(--text);
}
.now-b {
  flex: none;
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line2);
  border-radius: 14px;
  background: var(--card);
}
.now-t { font-size: 12px; color: var(--accent); }
.now-b:active { background: var(--accent-bg); }

/* ---- 月网格 ----
   表头和格子都用 7 等分网格，两边才对得齐。表头单独用 flex 均分也行，
   但那就要保证两处的间距算法一致 —— 用同一套 grid 最省事。 */
.wk, .grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}
.wk { margin-bottom: 4px; }
.wk-t {
  text-align: center;
  font-size: 11px;
  color: var(--muted);
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 5px 2px 4px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.cell-d { font-size: 13px; color: var(--text); }
/* 不在这个月的日子压暗，但**不隐藏** —— 首尾那两行留白会让整块网格缺角 */
.cell.is-out { background: var(--bg); border-color: transparent; }
.cell.is-out .cell-d { color: var(--muted); }
.cell.is-today { border-color: var(--accent); }
.cell.is-today .cell-d { color: var(--accent); font-weight: 500; }
.cell.is-sel { background: var(--accent-bg); border-color: var(--accent); }
.cell:active { background: var(--bg); }

.cell-m {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 13px;
  margin-top: 2px;
}
/* 当天支出的金额。10px：比日期（13px）小一档、和待办数那枚胶囊（9px）同一量级，
   放在同一格里不会抢日期的眼。没有支出的日子这行是空的但仍然占位（见模板）。 */
.cell-a {
  display: block;
  min-height: 13px;
  margin-top: 1px;
  font-size: 10px;
  line-height: 1.3;
  color: var(--muted);
}
/* 数量那枚小胶囊：逾期用 warn，没到期的用 accent。
   两个颜色对应两种处境 —— 欠着的和还没到点的。 */
.pill {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 13px;
  padding: 0 4px;
  border-radius: 7px;
  background: var(--accent);
}
.pill.is-late { background: var(--warn); }
.pill-t { font-size: 9px; line-height: 1; color: #fff; }
.dot {
  width: 5px;
  height: 5px;
  margin-left: 3px;
  border-radius: 50%;
}
.dot-h { background: var(--ok); }
.dot-m { background: var(--line2); }

/* ---- 图例 ---- */
.legend {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  margin: 8px 2px 12px;
}
.legend .pill { margin-right: 4px; }
.lg-t { margin-right: 10px; font-size: 11px; color: var(--muted); }
.legend .dot { margin-left: 0; margin-right: 4px; }

/* ---- 周视图：一天一块 ----
   用卡片包起来（和月网格的格子一样的底）而不是一整块大卡片分栏 ——
   空的日子会短一截，分栏的话右半边全空，看着像没渲染完。 */
.wday {
  margin-bottom: 6px;
  padding: 6px 12px 4px;
  background: var(--card);
  border: 1px solid var(--line);
  border-left: 3px solid var(--line);
  border-radius: var(--r);
}
.wday.is-today { border-left-color: var(--accent); }
.wday.is-sel { background: var(--accent-bg); }
.wday-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding: 4px 0 2px;
}
.wday-d { font-size: 13px; color: var(--text); }
.wday-d.is-today { color: var(--accent); font-weight: 500; }
.wday-n { font-size: 11px; color: var(--muted); }
/* 这一周里每一天的待办行都比月模式里矮一点 —— 七天堆在一起，
   46px 的行高会让一周滚三屏。 */
.wday .row { min-height: 40px; }

/* 账单条那套样式（.bill / .bchips / .bill-d …）在 components/BillBar.vue ——
   月视图和周视图各渲染一条，样式留在这儿的话只对其中一条生效。 */

/* ---- 区块（和别的页一份样子）---- */
.block {
  margin-bottom: 14px;
  padding: 10px 14px 4px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.block-h {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 6px;
}
.tag { font-size: 14px; font-weight: 500; color: var(--text); }
.block-note { font-size: 12px; color: var(--muted); }

.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 46px;
  border-top: 1px solid var(--line);
}
.row:active { background: var(--bg); }
.row-main { flex: 1 1 auto; min-width: 0; padding: 6px 0; }
.row-t { display: block; font-size: 14px; color: var(--text); }
.row-t.is-done { color: var(--muted); text-decoration: line-through; }
.row-m { display: block; font-size: 12px; color: var(--muted); margin-top: 1px; }
.row-m.is-late { color: var(--warn); }

/* ---- 那一天里的小节 ----
   一天一块，里面按 记账 / 待办 / 打卡 / 记录 分成四小节。
   小节头左边是名字、右边是该节的合计；空的小节给一句「这天没…」，
   不留白 —— 留白看不出是「那天没有」还是「这块没渲染」。 */
.sec { padding: 2px 0 8px; }
.sec + .sec { border-top: 1px solid var(--line); }
.sec-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding: 6px 0 2px;
}
.sec-k { font-size: 12px; color: var(--sub); }
.sec-n { font-size: 11px; color: var(--muted); }
.sec-e { padding: 3px 0 5px; }
.sec-e-t { font-size: 12px; color: var(--muted); }
.secrow {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  min-height: 28px;
  padding: 4px 0;
}
.secrow-k { flex: 1 1 auto; min-width: 0; font-size: 13px; color: var(--text); }
.secrow-v { flex: none; margin-left: 8px; font-size: 13px; color: var(--sub); }
.secrow-v.is-ok { color: var(--ok); }

.empty { padding: 10px 0 16px; }
.empty-t { display: block; font-size: 13px; color: var(--muted); }
</style>
