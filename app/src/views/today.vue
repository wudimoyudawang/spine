<template>
  <view class="page">
    <PageHead title="今日" :sub="headDate" />

    <!-- 今天花了多少。本月的合计也放这儿 —— 单看今天没参照。 -->
    <view class="moneyline">
      <text class="ml-s">今天</text>
      <text class="ml-b">{{ money(todaySum) }}</text>
      <text class="ml-s">· {{ todayLogs.length }} 笔</text>
      <text class="ml-s ml-gap">本月</text>
      <text class="ml-b">{{ money(monthSum) }}</text>
      <view class="ml-go" @click="go('ledger')"><text class="ml-go-t">去记账</text></view>
    </view>

    <!-- 记东西的入口不在这儿了：底栏中间那颗加号打开面板。
         这一页从此只负责「看今天」，不负责「记」。 -->

    <!-- 逾期。排在最前面 —— 这一天的第一眼该看见最欠着的那些事。 -->
    <view v-if="tt.overdue.length" class="block">
      <view class="block-h">
        <text class="tag tag-warn">逾期</text>
        <text class="block-note">{{ topLevel(tt.overdue) }} 条</text>
      </view>
      <TreeRow
        v-for="r in tt.overdue"
        :key="r.node.id"
        :depth="r.depth"
        :kids="r.kids"
        :closed="r.closed"
        :add-on="subOn === r.spec"
        :armed="armed === r.spec"
        @fold="fold(r.node.id)"
        @open="edit(r.spec)"
        @add="armAdd(r.spec)"
        @sub="(t) => commitSub(r.spec, t)"
        @del="del(r.spec, r.node)"
      >
        <template #lead>
          <view class="cbox" @click.stop="toggleDone(r.node)">
            <view class="cbox-box" :class="{ 'is-on': r.node.status === 'done' }">
              <svg v-if="r.node.status === 'done'" class="cbox-tick" viewBox="0 0 16 16">
                <path d="M3.4 8.6l3.1 3.1 6.1-6.6" fill="none" stroke="#fff"
                      stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </view>
          </view>
        </template>
        <text class="row-t" :class="{ 'is-done': r.node.status === 'done' }">{{ label(r.node) }}</text>
        <text class="row-m">{{ pathPre(r) }}{{ domainName(r.node) }} · {{ r.node.due.slice(5) }} 到期</text>
      </TreeRow>
    </view>

    <!-- 待办 / 已完成两个视图，用块头那颗按钮切。
         两个都只看今天 —— 历史的去「空间」里对应的领域看（那边不过滤状态，
         做完的和没做完的都在，只是做完的划掉）。 -->
    <view class="block">
      <view class="block-h">
        <text class="tag">{{ doneView ? '已完成' : '待办' }}</text>
        <view class="block-acts">
          <text class="block-note">{{ doneView ? tt.done.length : topLevel(tt.due) }} 条</text>
          <view class="addbtn" @click="doneView = !doneView">
            <text class="addbtn-t">{{ doneView ? '待办' : '已完成' }}</text>
          </view>
          <view v-if="!doneView" class="addbtn" @click="addTop('todo')">
            <PlusIcon :size="14" />
            <text class="addbtn-t">新增待办</text>
          </view>
        </view>
      </view>

      <view v-if="!rows.length" class="empty">
        <text class="empty-t">{{ doneView ? '今天还没有做完的' : '今天没有到期的待办' }}</text>
        <text class="empty-t">{{ doneView ? '点左边的方框就能完成一条' : '点上面的「新增待办」加一条' }}</text>
      </view>
      <TreeRow
        v-for="r in rows"
        :key="r.node.id"
        :depth="r.depth"
        :kids="r.kids"
        :closed="r.closed"
        :add-on="subOn === r.spec"
        :armed="armed === r.spec"
        @fold="fold(r.node.id)"
        @open="edit(r.spec)"
        @add="armAdd(r.spec)"
        @sub="(t) => commitSub(r.spec, t)"
        @del="del(r.spec, r.node)"
      >
        <template #lead>
          <view class="cbox" @click.stop="toggleDone(r.node)">
            <view class="cbox-box" :class="{ 'is-on': r.node.status === 'done' }">
              <svg v-if="r.node.status === 'done'" class="cbox-tick" viewBox="0 0 16 16">
                <path d="M3.4 8.6l3.1 3.1 6.1-6.6" fill="none" stroke="#fff"
                      stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </view>
          </view>
        </template>
        <text class="row-t" :class="{ 'is-done': r.node.status === 'done' }">{{ label(r.node) }}</text>
        <text class="row-m">{{ pathPre(r) }}{{ domainName(r.node) }}</text>
      </TreeRow>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">习惯</text>
        <view class="block-acts">
          <text class="block-note">点右边打卡</text>
          <view class="addbtn" @click="addTop('habit')">
        <PlusIcon :size="14" /><text class="addbtn-t">新增习惯</text>
      </view>
        </view>
      </view>
      <TreeRow
        v-for="r in hb"
        :key="r.node.id"
        :depth="r.depth"
        :kids="r.kids"
        :closed="r.closed"
        :add-on="subOn === r.spec"
        :armed="armed === r.spec"
        @fold="fold(r.node.id)"
        @open="edit(r.spec)"
        @add="armAdd(r.spec)"
        @sub="(t) => commitSub(r.spec, t)"
        @del="del(r.spec, r.node)"
      >
        <text class="row-t">{{ label(r.node) }}</text>
        <text class="row-m">{{ pathPre(r) }}{{ r.dom.name }} · {{ r.node.m }}</text>
        <text v-if="streak(r.node.id)" class="row-st" :class="{ 'is-on': streak(r.node.id).on }">{{ streak(r.node.id).s }}</text>
        <template #tail>
          <view class="tick" :class="{ 'is-on': habitDoneOn(r.node.id, TODAY) }" @click.stop="tick(r.node.id)">
            <text class="tick-t">{{ habitDoneOn(r.node.id, TODAY) ? '已打卡' : '打卡' }}</text>
          </view>
        </template>
      </TreeRow>
    </view>

    <!-- 计划：带进度条的长期目标。所有领域的平铺在一起 ——
         今日页不按领域分组，因为「今天该推哪一件事」是跨领域的问题。
         今日页的进度只读：改进度是回到空间里干的事，那一页给滑杆。 -->
    <view v-if="gl.length" class="block">
      <view class="block-h">
        <text class="tag">计划</text>
        <view class="block-acts">
          <text class="block-note">{{ gl.length }} 个</text>
          <view class="addbtn" @click="addTop('goal')">
        <PlusIcon :size="14" /><text class="addbtn-t">新增计划</text>
      </view>
        </view>
      </view>
      <TreeRow
        v-for="r in gl"
        :key="r.node.id"
        :depth="r.depth"
        :kids="r.kids"
        :closed="r.closed"
        :add-on="subOn === r.spec"
        :armed="armed === r.spec"
        @fold="fold(r.node.id)"
        @open="editGoal(r.spec)"
        @add="armAdd(r.spec)"
        @sub="(t) => commitSub(r.spec, t)"
        @del="del(r.spec, r.node)"
      >
        <text class="row-t">{{ label(r.node) }}</text>
        <text class="row-m">{{ pathPre(r) }}{{ r.dom.name }} · 长期 · {{ progressOf(r.spec) }}%</text>
        <template #tail>
          <view class="bar">
            <view class="bar-fill" :style="'width:' + progressOf(r.spec) + '%'"></view>
          </view>
        </template>
      </TreeRow>
    </view>

    <!-- 今天记下的 = 操作流水。连着真实数据的那几条点得开（改的就是那条支出、
         那条记录）；只有一行字的点开只能移除 —— 不假装能改历史。 -->
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
  db, TODAY, money, go, weekdayCN,
  habitDoneOn, streakText, toggleHabitLog,
  moneyTotalOf, toggleFold, openAdd, addSub, openEdit, openLogEdit, rowBody,
  openGoalAdd, openGoal, armDelete, delArmed, labelOf, todayTree, habitTree, goalTree,
  progressOf, domainName, topLevel, saveState
} from '../stores/db'
import PageHead from '../components/PageHead.vue'
import PlusIcon from '../components/PlusIcon.vue'
import TreeRow from '../components/TreeRow.vue'

const headDate = computed(function () {
  const p = TODAY.split('-').map(Number)
  return p[1] + ' 月 ' + p[2] + ' 日 · 周' + weekdayCN(TODAY)
})

/* 三棵树都来自数据层那一份构建处 —— 今日页和领域页读同一批行对象，
   所以「子项跟着父项出现」这条规矩在两页的表现是一样的。 */
const tt = computed(() => todayTree(TODAY))
const hb = computed(() => habitTree())
const gl = computed(() => goalTree())

const todayLogs = computed(() => db.LOGS.filter(l => l.date === TODAY && l.kind === 'money'))
const todaySum = computed(() => todayLogs.value.reduce((s, l) => s + Number(l.value || 0), 0))

/* 操作流水就在数据层那一堆里，新的在头上 —— 这里不重排，
   因为「刚记的那条在最上面」这件事在写的时候就定了（见 pushTodayLog）。 */
const flow = computed(() => db.TODAY_LOGS)

/* 本月合计。按日期前缀算，不是「过去 30 天」——
   月初打开时该看到这个月花了多少，不是上个月那三十天。 */
const monthSum = computed(() => moneyTotalOf(TODAY.slice(0, 7)))

const label = labelOf
const fold = toggleFold
const armed = delArmed

/* 待办 / 已完成两个视图，块头那颗按钮切的就是它。
   只存一个布尔，不存「上次看的是哪个」—— 重开应用该回到待办，
   而不是停在一屏已完成上。 */
const doneView = ref(false)
const rows = computed(function () {
  return doneView.value ? tt.value.done : tt.value.due
})

/* 子项那行的灰字前面补一句上级路径。今日页不铺整棵树，
   光靠缩进看不出来它挂在谁下面。 */
function pathPre(r) {
  return r.path ? r.path + ' · ' : ''
}

/* 「连续 N 天 · 累计 M 天」这句在数据层，两页共用一份措辞。
   一次没打过的习惯那里返回 null，这一行就整段不显示。 */
function streak(id) {
  return streakText(id, TODAY)
}

/* ---- 就地加子项：哪一行的输入框开着 ---- */
const subOn = ref('')

function armAdd(spec) {
  subOn.value = subOn.value === spec ? '' : spec
}
function commitSub(spec, text) {
  if (subOn.value !== spec) return
  subOn.value = ''
  const t = String(text || '').trim()
  if (!t) return
  const r = addSub(spec, t)
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  saveState(true)
  uni.showToast({ title: '已加上「' + t + '」', icon: 'none' })
}

/* ---- 新增：三个区块各有一颗，走同一个弹窗、换 kind ----
   今日页的待办写进 ITEMS（到期就是今天），这样它当场就出现在这一页；
   习惯和计划本来就跨领域，写进所属领域的桶。这个分叉只在 commitAdd 里。 */
function addTop(kind) {
  if (kind === 'goal') {
    const r = openGoalAdd(db.DOMAINS[0] ? db.DOMAINS[0].id : '', null, '')
    if (r.error) uni.showToast({ title: r.error, icon: 'none' })
    return
  }
  openAdd(kind, {})
}

/* ---- 编辑：整行点开 ---- */
function edit(spec) {
  const r = openEdit(spec)
  if (r && r.error) uni.showToast({ title: r.error, icon: 'none' })
}
/* 流水那一行点开去哪，由数据层判断（连着真实数据的去改它，没连着的只能移除）。
   页面上不知道也不该知道 ref 长什么样。 */
function openLog(e) {
  const r = openLogEdit(e)
  if (r && r.error) uni.showToast({ title: r.error, icon: 'none' })
}
function editGoal(spec) {
  const r = openGoal(spec)
  if (r.error) uni.showToast({ title: r.error, icon: 'none' })
}

/* ---- 删除：两段确认 ---- */
function del(spec, node) {
  const r = armDelete(spec)
  if (!r) { uni.showToast({ title: '再点一次「确认删」', icon: 'none' }); return }
  saveState(true)
  uni.showToast({ title: '已删除「' + labelOf(node) + '」', icon: 'none' })
}

function tick(id) {
  const on = toggleHabitLog(id, TODAY)
  saveState()
  uni.showToast({ title: on ? '已打卡' : '已取消今天的打卡', icon: 'none' })
}

/* 勾选框：点一下完成，再点一下取消。
   能反悔是**有意做的** —— 误触一下就没了、还找不回来的按钮，人用起来会不敢点。
   完成的那一条不会从列表里消失（见 db.js 的 pickToday），所以有东西可点。 */
function toggleDone(it) {
  const wasDone = it.status === 'done'
  it.status = wasDone ? 'todo' : 'done'
  saveState()
  uni.showToast({ title: wasDone ? '取消完成' : '完成了', icon: 'none' })
}
</script>

<style scoped>
.page {
  /* 底部留白只要让开底部栏。「记一笔」已经进了栏里，
     不再有浮在栏上方的那颗按钮，所以不用再多留那 46px。 */
  padding: 14px 14px calc(76px + env(safe-area-inset-bottom));
}


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
.tag-warn { color: var(--warn); }
.block-note { font-size: 12px; color: var(--muted); }
.block-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
}

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
.row-main { flex: 1 1 auto; min-width: 0; padding: 6px 0; }
.row-t { display: block; font-size: 14px; color: var(--text); }
.row-m { display: block; font-size: 12px; color: var(--muted); margin-top: 1px; }
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
.ml-s { font-size: 12px; color: var(--sub); }
.ml-b { margin-left: 4px; font-size: 12px; font-weight: 500; color: var(--text); }
.ml-gap { margin-left: 16px; }
.ml-go { margin-left: auto; }
.ml-go-t { font-size: 12px; color: var(--accent); }

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

.tick {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 6px 14px;
  margin-left: 8px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  background: var(--card);
}
.tick-t { font-size: 13px; color: var(--sub); }
.tick.is-on { background: var(--ok-bg); border-color: var(--ok); }
.tick.is-on .tick-t { color: var(--ok); }
.tick:active { background: var(--bg); }

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
/* ---- 待办的勾选框 ----
   点按区域比那个方框大一圈：方框本身只有 17px，手指点不准，
   而这一下点歪了是「没完成」和「完成了」的区别。 */
.cbox {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-right: 2px;
}
.cbox-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border: 1.5px solid var(--line2);
  border-radius: 4px;
  background: var(--card);
}
.cbox-box.is-on { background: var(--ok); border-color: var(--ok); }
.cbox-tick { width: 11px; height: 11px; display: block; }

/* 完成的待办划掉。它留在列表里是为了能取消，不是为了让人再看一遍 */
.row-t.is-done { color: var(--muted); text-decoration: line-through; }
</style>
