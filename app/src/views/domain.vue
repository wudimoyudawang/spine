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
            <view class="addbtn" @click="addTop('habit')"><PlusIcon :size="14" /><text class="addbtn-t">新增</text></view>
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
          <text class="row-t">{{ label(r.node) }}</text>
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
            <view class="addbtn" @click="addTop('todo')"><PlusIcon :size="14" /><text class="addbtn-t">新增</text></view>
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
          <text class="row-t">{{ label(r.node) }}</text>
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
            <view class="addbtn" @click="addTop('goal')"><PlusIcon :size="14" /><text class="addbtn-t">新增</text></view>
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
          <text class="row-t">{{ label(r.node) }}</text>
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

      <!-- 记录项：名称 / 方式 / 单位都由用户自己定。
           方式只有两种（纯文字、数值）—— 字段一多录入就慢，录入一慢功能就死，
           所以不给「自定义表单」这条路（HANDOFF 第 4 节）。 -->
      <view class="block">
        <view class="block-h">
          <text class="tag">记录项</text>
          <view class="block-acts">
            <text class="block-note">{{ rts.length }} 个</text>
            <view class="addbtn" @click="newRt">
        <PlusIcon v-if="rtOn !== 'new'" :size="14" /><text class="addbtn-t">{{ rtOn === 'new' ? '收起' : '新增' }}</text>
      </view>
          </view>
        </view>
        <view v-if="!rts.length && rtOn !== 'new'" class="empty">
          <text class="empty-t">这个领域还没有记录项。</text>
          <text class="empty-t">点上面的「新增」，起个名字就行。</text>
        </view>
        <view v-for="rt in rts" :key="rt.id" class="rt">
          <view class="rt-h">
            <text class="row-t">{{ rt.name }}</text>
            <text class="rt-kind">{{ kindOf(rt) }}</text>
            <text v-if="rt.quick" class="rt-kind">快记</text>
          </view>
          <text class="row-m">{{ latest(rt) }}</text>
          <view class="rt-ops">
            <view class="mini" @click="armEntry(rt)"><text class="mini-t">{{ entryOn === rt.id ? '收起' : '记一条' }}</text></view>
            <view class="mini" @click="openRt(rt.id)"><text class="mini-t">{{ rtOn === rt.id ? '收起' : '设置' }}</text></view>
            <view class="mini mini-del" @click="delRt(rt)">
              <text class="mini-t">{{ armed === 'rt:' + rt.id ? '确认删' : '删' }}</text>
            </view>
          </view>
          <RtForm v-if="rtOn === rt.id" :key="rt.id" :rt="rt" :domain="d.id" @save="saveRt" @cancel="rtOn = ''" />
          <!-- 记一条就在行里填，不值得为它开一层弹窗 -->
          <view v-if="entryOn === rt.id" class="rt-in">
            <input
              v-if="rt.mode === 'number'"
              v-model="entryVal"
              class="rin"
              type="digit"
              :placeholder="'数值（' + (rt.unit || '不带单位') + '）'"
              placeholder-class="rph"
            />
            <textarea
              v-else
              v-model="entryVal"
              class="rin rin-ta"
              placeholder="写点什么：今天的情况、感受、细节都行"
              placeholder-class="rph"
            />
            <view class="rt-in-btns">
              <view class="mini mini-go" @click="commitEntry(rt)"><text class="mini-t">存下</text></view>
              <view class="mini" @click="entryOn = ''"><text class="mini-t">取消</text></view>
            </view>
          </view>
        </view>
        <RtForm v-if="rtOn === 'new'" :key="'new'" :domain="d.id" @save="saveRt" @cancel="rtOn = ''" />
        <view class="note">
          <text class="note-t">删掉一个记录项只从界面收起。</text>
          <text class="note-t">它记过的还在数据里，导出也带着。</text>
        </view>
      </view>

      <!-- 领域本身：改名 + 删除。置顶那颗星在空间页的卡片上，这里不重复放。 -->
      <view class="block">
        <view class="block-h">
          <text class="tag">领域设置</text>
          <text class="block-note">改名、删除</text>
        </view>
        <view class="rt-in">
          <input v-model="nameDraft" class="rin" placeholder="这个领域叫什么" placeholder-class="rph" />
          <view class="rt-in-btns">
            <view class="mini mini-go" @click="rename"><text class="mini-t">改名</text></view>
          </view>
        </view>
        <view class="btn rt-del" :class="{ 'is-armed': armed === 'domain:' + d.id }" @click="delSelf">
          <text class="btn-t">{{ armed === 'domain:' + d.id ? '确认删除「' + d.name + '」' : '删除这个领域' }}</text>
        </view>
        <view class="note">
          <text class="note-t">删领域只删这个入口。</text>
          <text class="note-t">里面的 {{ contentN }} 条会回到收件箱等着重新归类。</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  db, TODAY, go, flattenTree, toggleFold, specOf, labelOf, domainById,
  habitDoneOn, streakText, toggleHabitLog, todosOf, topLevel,
  openAdd, addSub, openEdit, openGoal, openGoalAdd, armDelete, delArmed,
  progressOf, setGoalP, bumpGoal, GOAL_STEPS, recordTypesOf, saveState,
  saveRecordType, addRecord, renameDomain, domainContentCount
} from '../stores/db'
import PlusIcon from '../components/PlusIcon.vue'
import TreeRow from '../components/TreeRow.vue'
import RtForm from '../components/RtForm.vue'

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
  return logs[0].d + ' · ' + logs[0].v + (rt.unit || '')
}

/* ---- 记录项：新增 / 设置 / 记一条 / 收起 ----
   同一时刻只开一张草稿表（和规则表那条规矩一样）：
   留着两张的话，人会记不清刚才改的是哪一个。 */
const rtOn = ref('')
const entryOn = ref('')
const entryVal = ref('')

function kindOf(rt) {
  return rt.mode === 'number' ? ('数值' + (rt.unit ? ' · ' + rt.unit : '')) : '纯文字'
}
function newRt() {
  entryOn.value = ''
  rtOn.value = rtOn.value === 'new' ? '' : 'new'
}
function openRt(id) {
  entryOn.value = ''
  rtOn.value = rtOn.value === id ? '' : id
}
function saveRt(rec) {
  const r = saveRecordType(rec)
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  rtOn.value = ''
  saveState(true)
  uni.showToast({ title: r.was === 'new' ? '已加上「' + r.rt.name + '」' : '已保存', icon: 'none' })
}

function armEntry(rt) {
  rtOn.value = ''
  if (entryOn.value === rt.id) { entryOn.value = ''; return }
  entryOn.value = rt.id
  entryVal.value = ''
}
function commitEntry(rt) {
  const raw = String(entryVal.value || '').trim()
  if (!raw) { uni.showToast({ title: '先写点什么', icon: 'none' }); return }
  if (rt.mode === 'number') {
    const n = Number(raw)
    if (!isFinite(n)) { uni.showToast({ title: '数值型只能填数字', icon: 'none' }); return }
    addRecord(rt.id, Math.round(n * 100) / 100)
  } else {
    addRecord(rt.id, raw)
  }
  entryOn.value = ''
  entryVal.value = ''
  saveState(true)
  uni.showToast({ title: '已记入「' + rt.name + '」', icon: 'none' })
}

function delRt(rt) {
  const r = armDelete('rt:' + rt.id)
  if (!r) return
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  if (rtOn.value === rt.id) rtOn.value = ''
  if (entryOn.value === rt.id) entryOn.value = ''
  saveState(true)
  uni.showToast({ title: '已收起「' + r.label + '」', icon: 'none' })
}

/* ---- 领域本身 ---- */
const nameDraft = ref('')
const contentN = computed(function () { return domainContentCount(d.value) })

/* 换领域要把草稿丢掉：不丢的话，在 A 领域打的字会跟着跳到 B 领域的改名框里。 */
watch(function () { return db.DOMAIN_ID }, function () {
  nameDraft.value = d.value ? d.value.name : ''
  rtOn.value = ''
  entryOn.value = ''
}, { immediate: true })

function rename() {
  const r = renameDomain(db.DOMAIN_ID, nameDraft.value)
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  saveState(true)
  uni.showToast({ title: '已改名为「' + r.name + '」', icon: 'none' })
}

function delSelf() {
  const r = armDelete('domain:' + db.DOMAIN_ID)
  if (!r) { uni.showToast({ title: '再点一次才算删', icon: 'none' }); return }
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  saveState(true)
  go('spaces')
  uni.showToast({ title: '已删「' + r.label + '」· 内容回收件箱', icon: 'none' })
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

/* .addbtn 那三行搬到 styles/base.scss 了 —— 今日 / 领域 / 空间三页共用一份。 */

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

/* ---------------- 记录项 / 领域设置 ---------------- */
.rt {
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.rt-h {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
}
.rt-kind {
  margin-left: 6px;
  padding: 0 5px;
  border: 1px solid var(--line2);
  border-radius: 999px;
  font-size: 10px;
  color: var(--muted);
}
.rt-ops {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 7px;
}

.mini {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 28px;
  margin-right: 6px;
  padding: 0 10px;
  border: 1px solid var(--line2);
  border-radius: 14px;
}
.mini-t { font-size: 11px; color: var(--sub); }
.mini:active { background: var(--accent-bg); border-color: var(--accent); }
.mini.is-dim { opacity: .35; }
.mini-del:active { background: var(--danger-bg); border-color: var(--danger); }
.mini-del:active .mini-t { color: var(--danger); }
/* 「存下」这种确认动作：平时就是主色，不用等点下去才亮 */
.mini-go { background: var(--accent); border-color: var(--accent); }
.mini-go .mini-t { color: #fff; }

/* 就地输入那一小块（记一条、改名共用） */
.rt-in { margin-top: 8px; }
.rt-in-btns { display: flex; flex-direction: row; align-items: center; margin-top: 8px; }
.rin {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text);
  box-sizing: border-box;
}
.rin-ta { height: 68px; padding-top: 8px; }
.rph { color: var(--muted); }

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--line2);
  border-radius: 10px;
}
.btn-t { font-size: 13px; color: var(--text); }
.btn:active { background: var(--bg); }
.rt-del { width: 100%; margin-top: 10px; }
/* 武装起来才变红，平时它和别的按钮一个样子 */
.rt-del.is-armed { background: var(--danger-bg); border-color: var(--danger); }
.rt-del.is-armed .btn-t { color: var(--danger); }
</style>
