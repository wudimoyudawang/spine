<template>
  <view class="page">
    <view class="pagehead">
      <view class="back" @click="go('spaces')"><text class="back-t">‹ 空间</text></view>
      <text class="ph-t">{{ d ? d.name : '领域' }}</text>
    </view>

    <view v-if="!d" class="block">
      <view class="empty"><text class="empty-t">找不到这个领域。</text></view>
    </view>

    <template v-else>
      <!-- 习惯 -->
      <view class="block">
        <view class="block-h">
          <text class="tag">习惯</text>
          <text class="block-note">{{ d.habits.length }} 个</text>
        </view>
        <view v-if="!d.habits.length" class="empty"><text class="empty-t">这个领域还没有习惯。</text></view>
        <template v-for="h in tops(d.habits)" :key="h.id">
          <view class="row">
            <view class="row-main">
              <text class="row-t">{{ h.t }}</text>
              <text class="row-m">{{ h.m }} · 连续 {{ habitStreakDays(h.id, TODAY) }} 天 · 累计 {{ habitTotalDays(h.id) }} 天</text>
            </view>
            <view class="tick" :class="{ 'is-on': habitDoneOn(h.id, TODAY) }" @click="tick(h.id)">
              <text class="tick-t">{{ habitDoneOn(h.id, TODAY) ? '已打卡' : '打卡' }}</text>
            </view>
          </view>
          <view v-for="k in kids(d.habits, h.id)" :key="k.id" class="row row-sub">
            <view class="row-main">
              <text class="row-t">{{ k.t }}</text>
              <text class="row-m">{{ k.m }} · 连续 {{ habitStreakDays(k.id, TODAY) }} 天 · 累计 {{ habitTotalDays(k.id) }} 天</text>
            </view>
            <view class="tick" :class="{ 'is-on': habitDoneOn(k.id, TODAY) }" @click="tick(k.id)">
              <text class="tick-t">{{ habitDoneOn(k.id, TODAY) ? '已打卡' : '打卡' }}</text>
            </view>
          </view>
        </template>
      </view>

      <!-- 待办 -->
      <view class="block">
        <view class="block-h">
          <text class="tag">待办</text>
          <text class="block-note">{{ d.todos.length }} 项</text>
        </view>
        <view v-if="!d.todos.length" class="empty"><text class="empty-t">这个领域还没有待办。</text></view>
        <template v-for="t in tops(d.todos)" :key="t.id">
          <view class="row">
            <view class="row-main">
              <text class="row-t">{{ t.t }}</text>
              <text class="row-m">{{ t.m }}</text>
            </view>
          </view>
          <view v-for="k in kids(d.todos, t.id)" :key="k.id" class="row row-sub">
            <view class="row-main">
              <text class="row-t">{{ k.t }}</text>
              <text class="row-m">{{ k.m }}</text>
            </view>
          </view>
        </template>
      </view>

      <!-- 长期目标 -->
      <view class="block">
        <view class="block-h">
          <text class="tag">长期目标</text>
          <text class="block-note">{{ d.goals.length }} 个</text>
        </view>
        <view v-if="!d.goals.length" class="empty"><text class="empty-t">这个领域还没有长期目标。</text></view>
        <template v-for="g in tops(d.goals)" :key="g.id">
          <view class="goalrow">
            <view class="goal-h">
              <text class="row-t">{{ g.t }}</text>
              <text class="goal-p">{{ g.p }}%</text>
            </view>
            <text class="row-m">{{ g.m }}</text>
            <view class="gbarw"><view class="gbarf" :style="'width:' + clamp(g.p) + '%'"></view></view>
          </view>
          <view v-for="k in kids(d.goals, g.id)" :key="k.id" class="goalrow goal-sub">
            <view class="goal-h">
              <text class="row-t">{{ k.t }}</text>
              <text class="goal-p">{{ k.p }}%</text>
            </view>
            <text class="row-m">{{ k.m }}</text>
            <view class="gbarw"><view class="gbarf" :style="'width:' + clamp(k.p) + '%'"></view></view>
          </view>
        </template>
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
        <text class="note-t">这里现在只能看和打卡、勾选；增删改下一轮搬过来。</text>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import {
  db, TODAY, go, kidsOf, domainById, recordTypesOf,
  habitDoneOn, habitStreakDays, habitTotalDays, toggleHabitLog
} from '../stores/db'

const d = computed(function () {
  return db.DOMAIN_ID ? domainById(db.DOMAIN_ID) : null
})

const rts = computed(function () {
  return d.value ? recordTypesOf(db.RECORD_TYPES, d.value.id) : []
})

/* 原型的子项是**任意级**的（子项还能再挂子项）。这里先做两层 ——
   种子数据里也只用了两层。等把「就地加子项」那套搬过来时一起做成递归，
   那时才有真的三层数据可以验。 */
function tops(list) { return (list || []).filter(function (x) { return !x.parent }) }
function kids(list, id) { return kidsOf(list, id) }

function clamp(p) {
  const n = Number(p || 0)
  return n < 0 ? 0 : (n > 100 ? 100 : n)
}

function latest(rt) {
  const logs = rt.logs || []
  if (!logs.length) return '还没记过'
  const l = logs[0]
  return l.d + ' · ' + l.v
}

function tick(id) {
  const on = toggleHabitLog(id, TODAY)
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
  align-items: baseline;
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
/* 子项缩进：层级靠左边的留白表达，不靠额外的线 —— 线多了整块会散 */
.row-sub { padding-left: 18px; }
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

.goalrow { padding: 10px 0; border-top: 1px solid var(--line); }
.goal-sub { padding-left: 18px; }
.goal-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
}
.goal-p { font-size: 13px; color: var(--accent); }
.gbarw {
  height: 6px;
  margin-top: 7px;
  background: var(--bg);
  border-radius: 3px;
  overflow: hidden;
}
.gbarf { height: 100%; background: var(--accent); border-radius: 3px; }

.note { padding: 2px 2px 0; }
.note-t { font-size: 12px; line-height: 1.5; color: var(--muted); }

.empty { padding: 12px 0 4px; }
.empty-t { font-size: 13px; line-height: 1.5; color: var(--muted); }
</style>
