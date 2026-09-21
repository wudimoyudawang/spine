<template>
  <view class="page">
    <view class="pagehead">
      <view class="back" @click="go('spaces')"><text class="back-t">‹ 空间</text></view>
      <text class="ph-t">{{ d ? d.name : '领域' }}</text>
    </view>

    <view v-if="!d" class="block">
      <view class="empty"><text class="empty-t">找不到这个领域。</text><text class="empty-t">回空间页看看。</text></view>
    </view>

    <template v-else>
      <!-- 习惯 -->
      <view class="block">
        <view class="block-h">
          <text class="tag">习惯</text>
          <view class="block-acts">
            <text class="block-note">{{ topLevel(habRows) }} 个</text>
            <view class="addbtn" @click="addTop('habit')"><text class="addbtn-t">新增</text></view>
          </view>
        </view>
        <view v-if="!habRows.length" class="empty">
          <text class="empty-t">这个领域还没有习惯。</text>
          <text class="empty-t">点上面的「新增」加一个。</text>
        </view>
        <TreeRow
          v-for="r in habRows"
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
          <text class="row-t">{{ r.node.t }}</text>
          <text class="row-m">{{ pathPre(r) }}{{ r.node.m }}</text>
          <text v-if="streak(r.node.id)" class="row-st" :class="{ 'is-on': streak(r.node.id).on }">{{ streak(r.node.id).s }}</text>
          <template #tail>
            <view class="tick" :class="{ 'is-on': habitDoneOn(r.node.id, TODAY) }" @click.stop="tick(r.node.id)">
              <text class="tick-t">{{ habitDoneOn(r.node.id, TODAY) ? '已打卡' : '打卡' }}</text>
            </view>
          </template>
        </TreeRow>
      </view>

      <!-- 待办 -->
      <view class="block">
        <view class="block-h">
          <text class="tag">待办</text>
          <view class="block-acts">
            <text class="block-note">{{ topLevel(todoRows) }} 条</text>
            <view class="addbtn" @click="addTop('todo')"><text class="addbtn-t">新增</text></view>
          </view>
        </view>
        <view v-if="!todoRows.length" class="empty">
          <text class="empty-t">这个领域还没有待办。</text>
          <text class="empty-t">点上面的「新增」加一项。</text>
        </view>
        <TreeRow
          v-for="r in todoRows"
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
          <text class="row-t">{{ r.node.t }}</text>
          <text class="row-m">{{ pathPre(r) }}{{ dueText(r.node) }}</text>
        </TreeRow>
      </view>

      <!-- 长期目标。进度在这页直接改：滑杆、+1/+2/+5 都在行上，
           整行点开才进弹窗（改名、改说明）。 -->
      <view class="block">
        <view class="block-h">
          <text class="tag">长期目标</text>
          <view class="block-acts">
            <text class="block-note">{{ topLevel(goalRows) }} 个</text>
            <view class="addbtn" @click="addTop('goal')"><text class="addbtn-t">新增</text></view>
          </view>
        </view>
        <view v-if="!goalRows.length" class="empty">
          <text class="empty-t">这个领域还没有长期目标。</text>
          <text class="empty-t">点上面的「新增」加一个。</text>
        </view>
        <TreeRow
          v-for="r in goalRows"
          :key="r.node.id"
          :depth="r.depth"
          :kids="r.kids"
          :closed="r.closed"
          :add-on="subOn === r.spec"
          :armed="armed === r.spec"
          :add-ph="'「' + label(r.node) + '」的子项，拆成几步走'"
          @fold="fold(r.node.id)"
          @open="editGoal(r.spec)"
          @add="armAdd(r.spec)"
          @sub="(t) => commitSub(r.spec, t)"
          @del="del(r.spec, r.node)"
        >
          <text class="row-t">{{ r.node.t }}</text>
          <text class="row-m">{{ pathPre(r) }}{{ r.node.m || '长期目标' }}</text>
          <!-- 进度那一排单独占一行。整行还要容下加号和删除，
               五样塞进同一行的话 430 宽里名字会被挤成一列一个字。
               @click.stop：拖滑杆不算「点开这条」，不该顺带弹出弹窗。 -->
          <view class="goal-prog" @click.stop>
            <slider
              class="gbar"
              :value="progressOf(r.spec)"
              min="0"
              max="100"
              step="1"
              :block-size="16"
              activeColor="#2F6FEB"
              backgroundColor="#E6E8EE"
              @changing="slide(r.spec, $event)"
              @change="slide(r.spec, $event)"
            />
            <text class="goal-val">{{ progressOf(r.spec) }}%</text>
            <view class="goal-btns">
              <view v-for="s in GOAL_STEPS" :key="s" class="gbtn" @click.stop="bump(r.spec, s)">
                <text class="gbtn-t">+{{ s }}</text>
              </view>
            </view>
          </view>
        </TreeRow>
      </view>

      <!-- 记录项 -->
      <view v-if="rts.length" class="block">
        <view class="block-h">
          <text class="tag">记录项</text>
          <text class="block-note">{{ rts.length }} 个</text>
        </view>
        <view v-for="rt in rts" :key="rt.id" class="row">
          <view class="row-main">
            <text class="row-t">{{ rt.name }}</text>
            <text class="row-m">{{ latest(rt) }}</text>
          </view>
          <text class="row-v">{{ rt.unit }}</text>
        </view>
      </view>

      <view class="note">
        <text class="note-t">记录项还不能增删改。下一轮补。</text>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  db, TODAY, go, flattenTree, toggleFold, specOf, labelOf, domainById,
  habitDoneOn, streakText, toggleHabitLog, todosOf, topLevel,
  openAdd, addSub, openEdit, openGoal, openGoalAdd, armDelete, delArmed,
  progressOf, setGoalP, bumpGoal, GOAL_STEPS, recordTypesOf, saveState
} from '../stores/db'
import TreeRow from '../components/TreeRow.vue'

const d = computed(function () {
  return db.DOMAIN_ID ? domainById(db.DOMAIN_ID) : null
})

const rts = computed(function () {
  return d.value ? recordTypesOf(db.RECORD_TYPES, d.value.id) : []
})

/* 三棵树都走 flattenTree —— 子项能任意级，不是只支持两层。
   折叠状态和今日页共用 db.CLOSED_NODES，所以在哪儿折的，切回来还是折着的。
   待办这一棵读的是 ITEMS 里 dom 指向本领域的那些：它和今日页那棵是**同一批行对象**，
   今天在这儿加一条带日期的，今日页那边当场就有。 */
function rows(list, kind) {
  if (!d.value) return []
  return flattenTree(list, null, 0).map(function (r) {
    return { node: r.node, depth: r.depth, kids: r.kids, closed: r.closed, path: r.path, spec: specOf(kind, r.node.id) }
  })
}
const habRows = computed(function () { return d.value ? rows(d.value.habits, 'habit') : [] })
const todoRows = computed(function () { return d.value ? rows(todosOf(d.value.id), 'item') : [] })
const goalRows = computed(function () { return d.value ? rows(d.value.goals, 'goal') : [] })

/* 一条待办在这一页要说清它有日期还是没有：没日期的不进今日页，
   看着像「怎么没出现在今天」，得在这儿就把原因写明白。 */
function dueText(it) {
  if (!it.due) return '没有日期'
  if (it.due === TODAY) return '今天'
  if (it.due < TODAY) return it.due.slice(5) + ' 到期 · 已过期'
  return it.due.slice(5) + ' 到期'
}

const label = labelOf
const fold = toggleFold
const armed = delArmed

function pathPre(r) {
  return r.path ? r.path + ' · ' : ''
}

/* 这句在数据层，和今日页共用一份措辞 */
function streak(id) {
  return streakText(id, TODAY)
}

function latest(rt) {
  const logs = rt.logs || []
  if (!logs.length) return '还没记过'
  return logs[0].d + ' · ' + logs[0].v
}

/* ---- 就地加子项 ---- */
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

/* ---- 新增 ----
   习惯和待办走共用弹窗（名称 + 一句说明 + 空间，这里空间已经定了）。
   计划走它自己的弹窗，因为它多一个进度字段 —— 两颗不同的钮，两个不同的入口。 */
function addTop(kind) {
  if (kind === 'goal') {
    const r = openGoalAdd(d.value.id, null, '')
    if (r.error) uni.showToast({ title: r.error, icon: 'none' })
    return
  }
  openAdd(kind, { space: d.value.id })
}

/* ---- 编辑：整行点开 ---- */
function edit(spec) {
  const r = openEdit(spec)
  if (r && r.error) uni.showToast({ title: r.error, icon: 'none' })
}
function editGoal(spec) {
  const r = openGoal(spec)
  if (r.error) uni.showToast({ title: r.error, icon: 'none' })
}

/* ---- 进度 ---- */
function slide(spec, e) {
  if (setGoalP(spec, e.detail.value, 'slider') === null) return
  saveState()
}
function bump(spec, s) {
  if (bumpGoal(spec, s) === null) return
  saveState(true)
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
</script>

<style scoped>
.page {
  padding: 14px 14px calc(76px + env(safe-area-inset-bottom));
}

.pagehead { padding: 4px 46px 10px 2px; }
.back { padding: 2px 0 6px; }
.back-t { font-size: 13px; color: var(--accent); }
.ph-t { display: block; font-size: 22px; font-weight: 500; color: var(--text); }

.block {
  margin-bottom: 14px;
  padding: 10px 14px 12px;
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
.block-acts { display: flex; flex-direction: row; align-items: center; }

.addbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  margin-left: 10px;
  padding: 0 11px;
  border: 1px solid var(--line2);
  border-radius: 15px;
}
.addbtn-t { font-size: 12px; color: var(--accent); }
.addbtn:active { background: var(--accent-bg); }

.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 46px;
  border-top: 1px solid var(--line);
}
.row-main { flex: 1 1 auto; min-width: 0; padding: 6px 0; }
.row-t { display: block; font-size: 14px; color: var(--text); }
.row-m { display: block; margin-top: 1px; font-size: 12px; color: var(--muted); }
.row-v { font-size: 12px; color: var(--sub); }

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

/* 进度排在名字下面一行：滑杆吃掉这一行剩下的宽度，
   百分比和快捷钮的尺寸沿用 modal.scss 里弹窗那一套，两处一个样子。 */
.goal-prog { margin-top: 4px; }
.gbar { min-width: 60px; }

.note { padding: 2px 2px 0; }
.note-t { display: block; font-size: 12px; line-height: 1.5; color: var(--muted); }

/* 连续/累计那句：数字本身由数据层那句话给全，这里只管要不要加重。
   连着的人值得亮一下，断了的人看到灰色'连续 0 天' —— 那比换句说法诚实。 */
.row-st {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.row-st.is-on { color: var(--ok); }

.empty { padding: 12px 0 4px; }
.empty-t { display: block; font-size: 13px; line-height: 1.5; color: var(--muted); }
</style>
