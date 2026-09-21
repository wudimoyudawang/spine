<template>
  <view class="page">
    <view class="pagehead">
      <text class="ph-t">今日</text>
      <text class="ph-d">{{ headDate }}</text>
    </view>

    <!-- 记东西的入口不在这儿了：底栏中间那颗加号打开面板。
         这一页从此只负责「看今天」，不负责「记」。 -->

    <!-- 已过期。排在最前面 —— 这一天的第一眼该看见最欠着的那些事。 -->
    <view v-if="today.overdue.length" class="block">
      <view class="block-h">
        <text class="tag tag-warn">已过期</text>
        <text class="block-note">{{ today.overdue.length }} 条</text>
      </view>
      <view v-for="it in today.overdue" :key="it.id" class="row">
        <view class="row-main">
          <text class="row-t">{{ it.title }}</text>
          <text class="row-m">{{ it.domain }} · {{ it.due.slice(5) }} 到期</text>
        </view>
        <view class="tick" @click="finish(it)"><text class="tick-t">完成</text></view>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">今天</text>
        <text class="block-note">{{ today.due.length }} 条待办</text>
      </view>
      <view v-if="!today.due.length" class="empty"><text class="empty-t">今天没有到期的待办</text></view>
      <view v-for="it in today.due" :key="it.id" class="row">
        <view class="row-main">
          <text class="row-t">{{ it.title }}</text>
          <text class="row-m">{{ it.domain }}</text>
        </view>
        <view class="tick" @click="finish(it)"><text class="tick-t">完成</text></view>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">习惯</text>
        <text class="block-note">点右边打卡</text>
      </view>
      <view v-for="h in habits" :key="h.id" class="row">
        <view class="row-main">
          <text class="row-t">{{ h.t }}</text>
          <text class="row-m">{{ h.m }} · 连续 {{ habitStreakDays(h.id, TODAY) }} 天 · 累计 {{ habitTotalDays(h.id) }} 天</text>
        </view>
        <view class="tick" :class="{ 'is-on': habitDoneOn(h.id, TODAY) }" @click="tick(h.id)">
          <text class="tick-t">{{ habitDoneOn(h.id, TODAY) ? '已打卡' : '打卡' }}</text>
        </view>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">今天记下的</text>
        <text class="block-note">{{ money(todaySum) }}</text>
      </view>
      <view v-if="!todayLogs.length" class="empty"><text class="empty-t">今天还没记账</text></view>
      <view v-for="l in todayLogs" :key="l.id" class="row">
        <view class="row-main">
          <text class="row-t">{{ l.category || '未分类' }}</text>
          <text class="row-m">支出</text>
        </view>
        <text class="row-v">{{ money(l.value) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import {
  db, TODAY, money, pickToday, weekdayCN,
  habitDoneOn, habitStreakDays, habitTotalDays, toggleHabitLog
} from '../stores/db'

const headDate = computed(function () {
  const p = TODAY.split('-').map(Number)
  return p[1] + ' 月 ' + p[2] + ' 日 · 周' + weekdayCN(TODAY)
})

const today = computed(() => pickToday(db.ITEMS, TODAY))

const habits = computed(function () {
  const out = []
  for (const d of db.DOMAINS) {
    for (const h of (d.habits || [])) out.push(h)
  }
  return out
})

const todayLogs = computed(() => db.LOGS.filter(l => l.date === TODAY))
const todaySum = computed(() =>
  todayLogs.value.reduce((s, l) => s + Number(l.value || 0), 0)
)

function tick(id) {
  const on = toggleHabitLog(id, TODAY)
  uni.showToast({ title: on ? '已打卡' : '已取消今天的打卡', icon: 'none' })
}

function finish(it) {
  it.status = 'done'
  uni.showToast({ title: '完成了', icon: 'none' })
}
</script>

<style scoped>
.page {
  /* 底部留白只要让开底部栏。「记一笔」已经进了栏里，
     不再有浮在栏上方的那颗按钮，所以不用再多留那 46px。 */
  padding: 14px 14px calc(76px + env(safe-area-inset-bottom));
}

.pagehead {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding: 4px 46px 12px 2px;
}
.ph-t { font-size: 22px; font-weight: 500; color: var(--text); }
.ph-d { font-size: 13px; color: var(--sub); }

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
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 6px;
}
.tag { font-size: 14px; font-weight: 500; color: var(--text); }
.tag-warn { color: var(--warn); }
.block-note { font-size: 12px; color: var(--muted); }

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

.empty { padding: 12px 0 16px; }
.empty-t { font-size: 13px; color: var(--muted); }
</style>
