<template>
  <view class="page">
    <PageHead title="今日" :sub="headDate" />
    <!-- 今日 / 日历 / 四象限。三个镜头一起放在页头下面，位置在三个页面里都一样 ——
         切过去的时候那颗分段器不跳，才知道自己还在同一处。 -->
    <ViewSeg />

    <!-- 今天花了多少。本月的合计也放这儿 —— 单看今天没参照。
         整行可点 → 记账页。**不再写「去记账」三个字**：底栏已经有「记账」
         那一格了，这儿再写一句就是同一件事的第二个入口（这个仓库一直在删的那种）。
         右边那颗 › 是唯一的方向符号，有它就够说明「这一行能点」。 -->
    <view class="moneyline" @click="go('ledger')">
      <text class="ml-s">今天</text>
      <text class="ml-b">{{ money(todaySum) }}</text>
      <text class="ml-s">· {{ todayLogs.length }} 笔</text>
      <text class="ml-s ml-gap">本月</text>
      <text class="ml-b">{{ money(monthSum) }}</text>
      <text class="ml-go">›</text>
    </view>

    <!-- 待办 / 习惯 / 计划 收进一颗分段器。
         原来三块铺在一起，整页 2231px（约 2.8 屏），其中这三块占 75%。
         收进分段器之后最长的那一档也只 1.5 屏。

         ⚠️ 这一颗**小一号、而且是第二颗**：页头那颗管「镜头」（我在哪一格底下），
         这一颗管「今天看哪一类」。两颗长得一样的话，人会分不清哪颗管什么。
         项目里已有这个语言 —— 日历页也是「页头大 seg + 一颗小 seg（月/周）」。 -->
    <view class="block">
      <view class="seg blk-seg">
        <view
          v-for="t in TABS_VIEW"
          :key="t.k"
          class="seg-b"
          :class="{ 'is-on': tab === t.k }"
          @click="tab = t.k"
        >
          <!-- 逾期那几个单独上橙。它藏在别的档后面时，这是唯一还能看见它的地方 ——
               不带这个数的话，「把习惯藏起来」就等于把今天的欠账也藏起来了。
               嵌在同一个 text 里（不是并排两个）：并排的话模板里那个换行会在
               中间渲染出一个空格，出来是「待办 8 ·4」而不是「待办 8·4」。 -->
          <text class="seg-t">{{ t.n }} {{ t.c }}<text v-if="t.late" class="seg-late">{{ t.late }}</text></text>
        </view>
      </view>

      <!-- 块头这一行只放**动作**：数已经在上面那一格上了，这儿再来一遍是重复。 -->
      <view class="blk-h">
        <text v-if="tabNote" class="block-note">{{ tabNote }}</text>
        <view class="block-acts">
          <view v-if="tab === 'todo'" class="addbtn" @click="doneView = !doneView">
            <text class="addbtn-t">{{ doneView ? '看没做完的' : '已完成' }}</text>
          </view>
          <view class="addbtn" @click="addTop(tab)">
            <PlusIcon :size="14" />
            <text class="addbtn-t">新增{{ tabName }}</text>
          </view>
        </view>
      </view>

      <!-- 待办：逾期和到期的在**同一条列表**里（它们本来就是同一种东西，
           差的只是到期日早晚）。按到期日自然排序，欠着的本来就在最前面。 -->
      <template v-if="tab === 'todo'">
        <view v-if="!rows.length" class="empty">
          <text class="empty-t">{{ doneView ? '今天还没有做完的' : '今天没有到期的待办' }}</text>
          <text class="empty-t">{{ doneView ? '点左边的方框就能完成一条' : '点上面的「新增待办」加一条' }}</text>
        </view>
        <TreeList :rows="rows" :bar="rowBar" @open="edit">
          <template #lead="{ row }">
            <DoneBox :on="row.node.status === 'done'" @toggle="toggleDone(row.node)" />
          </template>
          <template #default="{ row }">
            <text class="row-t" :class="{ 'is-done': row.node.status === 'done' }">{{ label(row.node) }}</text>
            <!-- 逾期那行整行灰字转橙、并写出逾期几天。合进一条列表之后，
                 这是唯一能一眼分出「欠着的」和「今天该做的」的东西 ——
                 只写日期的话，得心算才知道 9-16 是几天前。 -->
            <text class="row-m" :class="{ 'is-late': isLateRow(row) }">{{ pathPrefix(row) }}{{ domainName(row.node) }}{{ lateNote(row) }}</text>
          </template>
        </TreeList>
      </template>

      <!-- 习惯 -->
      <template v-else-if="tab === 'habit'">
        <view v-if="!hb.length" class="empty">
          <text class="empty-t">还没有习惯。</text>
          <text class="empty-t">点上面的「新增习惯」加一个。</text>
        </view>
        <TreeList :rows="hb" tickable @open="edit">
          <template #default="{ row }">
            <text class="row-t">{{ label(row.node) }}</text>
            <text class="row-m">{{ pathPrefix(row) }}{{ row.dom.name }} · {{ row.node.m }}</text>
            <!-- 连续/累计那句和「今天打没打」都由**行对象**带过来（见 db.js 的 crossTree）。
                 原来这两个值在这里长了 5 次调用：streak 三次（v-if + :class + 插值）、
                 habitDoneOn 两次，每调用一次就要扫一遍全部打卡记录再排序。 -->
            <text v-if="row.streak" class="row-st" :class="{ 'is-on': row.streak.on }">{{ row.streak.s }}</text>
          </template>
        </TreeList>
      </template>

      <!-- 计划：带进度条的长期目标。所有领域的平铺在一起 ——
           今日页不按领域分组，因为「今天该推哪一件事」是跨领域的问题。
           今日页的进度只读：改进度是回到领域页干的事，那一页给滑杆。 -->
      <template v-else>
        <view v-if="!gl.length" class="empty">
          <text class="empty-t">还没有长期计划。</text>
          <text class="empty-t">点上面的「新增计划」加一个。</text>
        </view>
        <TreeList :rows="gl" @open="editGoal">
          <template #default="{ row }">
            <text class="row-t">{{ label(row.node) }}</text>
            <text class="row-m">{{ pathPrefix(row) }}{{ row.dom.name }} · 长期 · {{ progressOf(row.spec) }}%</text>
          </template>
          <template #tail="{ row }">
            <view class="bar">
              <view class="bar-fill" :style="'width:' + progressOf(row.spec) + '%'"></view>
            </view>
          </template>
        </TreeList>
      </template>
    </view>

    <!-- 今天记下的 = 操作流水。连着真实数据的那几条点得开（改的就是那条支出、
         那条记录）；只有一行字的点开只能移除 —— 不假装能改历史。
         它**不进上面那颗分段器**：它是「刚才记的落哪儿了」的确认，
         和「今天该做什么」不是一类；而且刚记完就要瞄一眼，藏起来要多点一下。 -->
    <view class="block">
      <view class="block-h">
        <text class="tag">今天记下的</text>
        <text class="block-note">刚记的都在这儿</text>
      </view>
      <view v-if="!flow.length" class="empty">
        <text class="empty-t">今天还没记什么</text>
        <text class="empty-t">底栏中间那颗加号，写一句就行</text>
      </view>
      <view v-for="e in flow" :key="e.id" class="row" @click="openLog(e)">
        <text class="log-d">{{ e.time }}</text>
        <view class="row-main">
          <text class="row-t"><text v-if="e.op" class="log-op">{{ e.op }}</text>{{ rowBody(e) }}</text>
        </view>
        <text v-if="e.ref" class="log-go">改</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  db, TODAY, money, go, fmtCNWide, pathPrefix, isLateRow, lateNote,
  moneyTotalOf, openAdd, openEdit, openLogEdit, rowBody, dirOf,
  openGoalAdd, openGoal, labelOf, todayTree, habitTree, goalTree,
  progressOf, domainName, saveState, quadOf, quadTone, rollRepeat
} from '../stores/db'
import PageHead from '../components/PageHead.vue'
import PlusIcon from '../components/PlusIcon.vue'
import TreeList from '../components/TreeList.vue'
import DoneBox from '../components/DoneBox.vue'
import ViewSeg from '../components/ViewSeg.vue'
import { toast } from '../lib/ui'

/* 页头那行日期用宽一档的写法（'9 月 23 日 · 周三'）。
   这串原来是在这儿现拼的，和 fmtCN 长得像又不完全一样；抽进数据层了。 */
const headDate = computed(function () { return fmtCNWide(TODAY) })

/* 三棵树都来自数据层那一份构建处 —— 今日页和领域页读的是同一批行对象，
   所以「子项跟着父项出现」这条规矩在两页的表现是一样的。 */
const tt = computed(() => todayTree(TODAY))
const hb = computed(() => habitTree())
const gl = computed(() => goalTree())

/* 这一行说的是「今天花了多少」，所以**只算支出**（`dirOf`）。
   加收入那天定的：收入要进的是记账页 / 日历 / 复盘三处，这一行不动 ——
   一行只有五个字的地方塞进收支两个数，两个都看不清；
   而且「今天进账 12000」会把「今天花了 32」这件事整个盖掉。 */
const todayLogs = computed(() => db.LOGS.filter(l => l.date === TODAY && l.kind === 'money' && dirOf(l) === 'out'))
const todaySum = computed(() => todayLogs.value.reduce((s, l) => s + Number(l.value || 0), 0))

/* 操作流水就在数据层那一堆里，新的在头上 —— 这里不重排，
   因为「刚记的那条在最上面」这件事在写的时候就定了（见 pushTodayLog）。 */
const flow = computed(() => db.TODAY_LOGS)

/* 本月合计。按日期前缀算，不是「过去 30 天」——
   月初打开时该看到这个月花了多少，不是上个月那三十天。 */
const monthSum = computed(() => moneyTotalOf(TODAY.slice(0, 7)))

const label = labelOf

/* ---- 今天看哪一类 ----

   为什么不记住（`tab` 是个本地 ref，不进 db）：
   和「录入页的日期不记住上次那个」同一条理由 —— 停在「计划」档过两天再打开，
   今天 3 条逾期待办就看不见了。「今天该做什么一眼看到」是这一页存在的理由。
   （页头那颗镜头是记住的，但它管的是「我在哪一格的底下」，不是一回事。） */
const TAB_NAME = { todo: '待办', habit: '习惯', goal: '计划' }
const tab = ref('todo')
const tabName = computed(function () { return TAB_NAME[tab.value] || '待办' })

/* 三格上的数。**必须带数**：不带的话，把习惯藏起来之后就再也不知道
   今天还有没有习惯没打 —— 那正是藏起来要付的代价，而这个数把它抵掉了。
   习惯那格给 `2/6`（今天打了 2 个 / 共 6 个）而不是 `6`：
   后面那个数只说了「有几个习惯」，没回答「今天还剩几个」。 */
const doneHabits = computed(function () { return hb.value.filter(function (r) { return r.doneToday }).length })

const TABS_VIEW = computed(function () {
  return [
    { k: 'todo', n: '待办', c: String(openCount.value), late: overCount.value ? ('·' + overCount.value) : '' },
    { k: 'habit', n: '习惯', c: hb.value.length ? (doneHabits.value + '/' + hb.value.length) : '0', late: '' },
    { k: 'goal', n: '计划', c: String(gl.value.length), late: '' }
  ]
})

/* 块头那行左边那句话。**不重复分段器上已有的数** ——
   「5 条」已经在「待办 5」里了，这儿再说一遍是同一句话写两遍。
   只留「分段器上说不了」的那些：已完成那档有几条、习惯怎么打。 */
const tabNote = computed(function () {
  if (tab.value === 'todo') return doneView.value ? ('已完成 ' + tt.value.done.length + ' 条') : ''
  if (tab.value === 'habit') return '点右边打卡'
  return ''
})

/* 待办 / 已完成两个视图，块头那颗按钮切的就是它。
   只存一个布尔，不存「上次看的是哪个」—— 重开应用该回到待办，
   而不是停在一屏已完成上。 */
const doneView = ref(false)
const rows = computed(function () {
  return doneView.value ? tt.value.done : tt.value.open
})

/* 两个数都数**列表里看得见的行**（含子项），不是只数顶层。
   这是项目里已有那条规矩：写得出的数必须数得出来 ——
   原来「逾期」和「待办」分成两张卡片时，两张各自只装顶层行，数顶层是对的；
   合并成一条之后列表里带着子项，再数顶层就会写成「5 条 · 2 条逾期」
   而屏幕上有四条带「逾期」的行。合并前那个数是对的，合并后不对了。 */
const openCount = computed(function () { return tt.value.open.length })
const overCount = computed(function () { return tt.value.open.filter(isLateRow).length })

/* 行左缘那条象限色条。已完成那一栏不给 —— 事情做完了，它属于哪个象限不再是
   需要一眼看到的东西；那一栏的灰和划线本身就是答案。
   （逾期判断 pathPrefix / lateNote 也一并搬去数据层了 —— 今日页和日历共用同一份。） */
function rowBar(r) {
  return doneView.value ? '' : quadTone(quadOf(r.node))
}

/* ---- 新增：三档各有一颗，走同一个弹窗、换 kind ----
   今日页的待办写进 ITEMS（到期就是今天），这样它当场就出现在这一页；
   习惯和计划本来就跨领域，写进所属领域的桶。这个分叉只在 commitAdd 里。 */
function addTop(kind) {
  if (kind === 'goal') {
    const r = openGoalAdd(db.DOMAINS[0] ? db.DOMAINS[0].id : '', null, '')
    if (r.error) toast(r.error)
    return
  }
  openAdd(kind, {})
}

/* ---- 编辑：整行点开 ---- */
function edit(spec) {
  const r = openEdit(spec)
  if (r && r.error) toast(r.error)
}
/* 流水那一行点开去哪，由数据层判断（连着真实数据的去改它，没连着的只能移除）。
   页面上不知道也不该知道 ref 长什么样。 */
function openLog(e) {
  const r = openLogEdit(e)
  if (r && r.error) toast(r.error)
}
function editGoal(spec) {
  const r = openGoal(spec)
  if (r.error) toast(r.error)
}

/* 勾选框：点一下完成，再点一下取消。
   能反悔是**有意做的** —— 误触一下就没了、还找不回来的按钮，人用起来会不敢点。
   完成的那一条不会从列表里消失（见 db.js 的 pickToday），所以有东西可点。 */
function toggleDone(it) {
  const wasDone = it.status === 'done'
  it.status = wasDone ? 'todo' : 'done'
  /* 重复的待办：完成的同时把下一次也建好。
     反悔（取消完成）的时候**不删**那条新生成的 —— 它是下一个月/周的事，
     删了就得再点一次勾选框才能找回来。 */
  let rolled = null
  if (!wasDone) rolled = rollRepeat(it)
  saveState()
  toast(wasDone ? '取消完成' : (rolled ? '完成了 · 下一次已排到 ' + rolled.due : '完成了'))
}
</script>

<style scoped>

.block {
  margin-bottom: 14px;
  padding: 10px 14px 4px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

/* 三档分段器：`.blk-seg`（小一号的那一层）在 base.scss ——
   记账页那颗「记账/记一笔」和这一颗逐字相同，留一份。
   这里只加这一页自己的：和上面那行内容的间距。 */
.blk-seg { margin-bottom: 2px; }
/* 逾期那几个单独上橙。**两种选中态都要写**：这一格被选中时底色是蓝的，
   橙色压在上面读不出来（base.scss 那条 `.seg-b.is-on .seg-t` 管不到它 ——
   它是个嵌套 text，没有 seg-t 这个类）。 */
.blk-seg .seg-late { color: var(--warn); }
.blk-seg .seg-b.is-on .seg-late { color: #fff; }

/* 块头那行：只有动作，靠右。数在上面那一格上，它不重复。 */
.blk-h {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding-bottom: 4px;
}
.block-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-left: auto;
}

/* 「N 条逾期」那半句。它挂在「5 条」后面，所以是一段内联文字，不是另一个标签 ——
   （原来逾期是单独一张卡片、有自己的橙色标题，合并之后只剩这半句了。） */
.note-late { font-size: 12px; color: var(--warn); }

/* 区块标题右边的「新增」：文字钮，不抢标题的眼。
   它比行尾那颗加号大一点 —— 那是「加一整条」，加子项是次要动作。 */
/* .addbtn 那三行搬到 styles/base.scss 了 —— 今日 / 领域 / 空间三页共用一份。
   留在这里的话，「给按钮加个图标」这一件事要改三遍。 */

.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 46px;
  border-top: 1px solid var(--line);
}
/* 逾期那一行的灰字整行转橙。合并成一条列表之后，颜色是唯一的即时区分 ——
   正文不乱动（还是黑的），只把说明那行染色，扫的时候不会觉得整块都在报警。 */
.row-m.is-late { color: var(--warn); }
.row-v { font-size: 14px; color: var(--text); }

/* ---- 操作流水那几行 ---- */
/* 时间钉在左边固定宽度，几行的正文才对得齐；
   右边那颗「改」只给连着真实数据的那几条 —— 只能移除的行不给这个期待。 */
.log-d {
  flex: none;
  width: 42px;
  font-size: 12px;
  color: var(--muted);
}
.log-op {
  margin-right: 5px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-bg);
  font-size: 11px;
  color: var(--accent);
}
.log-go { flex: none; margin-left: 8px; font-size: 12px; color: var(--accent); }
.row:active { background: var(--bg); }

/* ---- 记账行 ---- */
.moneyline {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  margin: -2px 0 14px;
}
.moneyline:active { opacity: .6; }
.ml-s { font-size: 12px; color: var(--sub); }
.ml-b { margin-left: 4px; font-size: 12px; font-weight: 500; color: var(--text); }
.ml-gap { margin-left: 16px; }
/* 整行可点之后，这颗 › 是唯一的方向符号（原来的「去记账」三个字删了）。 */
.ml-go { margin-left: auto; font-size: 15px; color: var(--muted); }

/* 计划行的进度条固定在右侧。给固定宽度而不是 flex:1 ——
   固定宽度下那几条杠的左端是对齐的，一眼能比出高低；
   跟着文字长度浮动就比不出来了。 */
.bar {
  flex: none;
  width: 84px;
  height: 6px;
  margin-left: 8px;
  background: var(--line);
  border-radius: 3px;
  overflow: hidden;
}
.bar-fill { height: 100%; background: var(--accent); border-radius: 3px; }

/* ---- 打卡按钮 ----
   .tick 那一套搬进 components/TreeList.vue 了 —— 按钮现在由它渲染，
   而 scoped 样式不跨组件生效。今日页和领域页原先各有一份逐字相同的。 */

/* 连续/累计那句：数字本身由数据层那句话给全，这里只管要不要加重。
   连着的人值得亮一下，断了的人看到灰色'连续 0 天' —— 那比换句说法诚实。 */
.row-st {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.row-st.is-on { color: var(--ok); }

.empty { padding: 12px 0 16px; }
.empty-t { display: block; font-size: 13px; color: var(--muted); }
/* 待办的勾选框（.cbox / .cbox-box / .cbox-tick）搬到 components/DoneBox.vue 了 ——
   原来这一页里就写了两份一模一样的（逾期一组、待办一组），日历和四象限还要用。
   留在这一页的话，「勾选样式改一下」要改四处。 */

/* 完成的待办划掉。它留在列表里是为了能取消，不是为了让人再看一遍 */
.row-t.is-done { color: var(--muted); text-decoration: line-through; }
</style>
