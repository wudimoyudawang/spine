<template>
  <view class="page">
    <view class="pagehead"><text class="ph-t">复盘</text></view>

    <view class="seg">
      <view class="seg-b" :class="{ 'is-on': mode === 'week' }" @click="mode = 'week'">
        <text class="seg-t">本周</text>
      </view>
      <view class="seg-b" :class="{ 'is-on': mode === 'month' }" @click="mode = 'month'">
        <text class="seg-t">本月</text>
      </view>
    </view>

    <view class="revbar"><text class="revbar-t">这一期：{{ rangeLabel }}</text></view>

    <view class="grid3">
      <view class="card">
        <text class="stat-v">{{ statDays }}</text>
        <text class="stat-s">打卡天数</text>
      </view>
      <view class="card">
        <text class="stat-v">{{ money(sum) }}</text>
        <text class="stat-s">支出</text>
      </view>
      <view class="card">
        <text class="stat-v">{{ logs.length }}</text>
        <text class="stat-s">记的账</text>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">习惯打卡</text>
        <text class="block-note">这一期 {{ days }} 天</text>
      </view>
      <view v-for="h in habits" :key="h.id" class="rev-h">
        <text class="rev-hk">{{ h.t }}</text>
        <text class="rev-hv">这一期 {{ habitDaysInRange(h.id, from, TODAY) }} 天</text>
        <text class="rev-hs">连续 {{ habitStreakDays(h.id, TODAY) }} 天 · 累计 {{ habitTotalDays(h.id) }} 天</text>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">这一期记下的事</text>
        <text class="block-note">{{ logs.length }} 条</text>
      </view>
      <view v-if="!logs.length" class="empty">
        <text class="empty-t">这一期还没有记下什么。</text>
      </view>
      <view v-for="l in logs" :key="l.id" class="noteitem">
        <text class="noteitem-d">{{ fmtCN(l.date) }}</text>
        <text class="noteitem-c">{{ l.category || '未分类' }} · {{ money(l.value) }}</text>
      </view>
    </view>

    <view class="block">
      <view class="block-h"><text class="tag">下一步</text></view>
      <input
        v-model="conclusion"
        class="inline-in"
        placeholder="这一期想留下的一句话"
        confirm-type="done"
        @confirm="toItem"
      />
      <view class="chips">
        <view class="btn btn-main" @click="toItem"><text class="btn-t btn-main-t">写成新事项</text></view>
        <view class="btn" @click="exportText"><text class="btn-t">导出这一期</text></view>
      </view>
      <view v-if="out" class="rev-out"><text class="rev-out-t">{{ out }}</text></view>
      <view class="note">
        <text class="note-t">复盘最容易漏的一步，是把结论写成待办。随心记不进复盘。</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  db, TODAY, money, fmtCN, startOfWeek, startOfMonth, dayCount,
  habitStreakDays, habitTotalDays, habitDaysInRange, addTodo
} from '../stores/db'

const mode = ref('week')
const conclusion = ref('')
const out = ref('')

const from = computed(function () {
  return mode.value === 'week' ? startOfWeek(TODAY) : startOfMonth(TODAY)
})
const days = computed(function () { return dayCount(from.value, TODAY) + 1 })
const rangeLabel = computed(function () {
  return fmtCN(from.value) + ' – ' + fmtCN(TODAY) + '　共 ' + days.value + ' 天'
})

const logs = computed(function () {
  return db.LOGS.filter(function (l) { return l.date >= from.value && l.date <= TODAY })
})
const sum = computed(function () {
  return logs.value.reduce(function (s, l) { return s + Number(l.value || 0) }, 0)
})

const habits = computed(function () {
  const list = []
  for (const d of db.DOMAINS) {
    for (const h of (d.habits || [])) list.push(h)
  }
  return list
})

/* 这一期「打过卡的天」数（同一天打几次只算一次），不是打卡次数。
   次数看着更热闹，但它说明不了「这几天有没有在坚持」。 */
const statDays = computed(function () {
  const has = {}
  for (const h of db.HABIT_LOGS) {
    if (h.date >= from.value && h.date <= TODAY) has[h.date] = 1
  }
  return Object.keys(has).length
})

function toItem() {
  const t = conclusion.value.trim()
  if (!t) { uni.showToast({ title: '先写一句结论', icon: 'none' }); return }
  addTodo(t, '')
  conclusion.value = ''
  uni.showToast({ title: '已写成今天的待办', icon: 'none' })
}

function exportText() {
  const lines = []
  lines.push('这一期：' + rangeLabel.value)
  lines.push('打卡 ' + statDays.value + ' 天 · 支出 ' + money(sum.value) + ' · 记了 ' + logs.length + ' 笔账')
  lines.push('')
  for (const h of habits.value) {
    const n = habitDaysInRange(h.id, from.value, TODAY)
    if (n > 0) {
      lines.push(h.t + '：这一期 ' + n + ' 天 · 连续 ' + habitStreakDays(h.id, TODAY) + ' 天 · 累计 ' + habitTotalDays(h.id) + ' 天')
    }
  }
  const text = lines.join('\n')
  out.value = text
  /* 复制而不是下载文件：手机上「导出」最常用的去向就是把它贴到别处，
     而下载在 App 的 WebView 里还得单独接原生文件写入。 */
  uni.setClipboardData({
    data: text,
    success: function () { uni.showToast({ title: '已复制', icon: 'none' }) }
  })
}
</script>

<style scoped>
.page {
  padding: 14px 14px calc(76px + env(safe-area-inset-bottom));
}

.pagehead { padding: 4px 46px 12px 2px; }
.ph-t { font-size: 22px; font-weight: 500; color: var(--text); }

.seg {
  display: flex;
  flex-direction: row;
  padding: 3px;
  margin-bottom: 10px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.seg-b {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border-radius: 8px;
}
.seg-b.is-on { background: var(--accent); }
.seg-t { font-size: 13px; color: var(--sub); }
.seg-b.is-on .seg-t { color: #fff; }

.revbar { padding: 0 2px 12px; }
.revbar-t { font-size: 12px; color: var(--muted); }

.grid3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;
}
.card {
  padding: 10px 8px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
  text-align: center;
}
.stat-v { display: block; font-size: 18px; font-weight: 500; color: var(--text); line-height: 1.3; }
.stat-s { display: block; margin-top: 2px; font-size: 11px; color: var(--muted); }

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
  padding-bottom: 8px;
}
.tag { font-size: 14px; font-weight: 500; color: var(--text); }
.block-note { font-size: 12px; color: var(--muted); }

.rev-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  flex-wrap: wrap;
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.rev-hk { flex: 1 1 auto; min-width: 0; font-size: 14px; color: var(--text); }
.rev-hv { margin-left: 8px; font-size: 13px; color: var(--accent); }
.rev-hs { width: 100%; margin-top: 2px; font-size: 12px; color: var(--muted); }

.noteitem { padding: 9px 0; border-top: 1px solid var(--line); }
.noteitem-d { display: block; font-size: 12px; color: var(--muted); }
.noteitem-c { display: block; margin-top: 2px; font-size: 14px; color: var(--text); }

.inline-in {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.chips { display: flex; flex-direction: row; margin-top: 10px; }
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  margin-right: 10px;
  border: 1px solid var(--line2);
  border-radius: 10px;
}
.btn-t { font-size: 13px; color: var(--text); }
.btn-main { background: var(--accent); border-color: var(--accent); }
.btn-main-t { color: #fff; }
.btn:active { background: var(--bg); }

/* 导出的文本要能一眼看清，所以用可换行的等宽排法 */
.rev-out {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: 10px;
}
.rev-out-t {
  font-size: 12px;
  line-height: 1.7;
  color: var(--sub);
  white-space: pre-wrap;
}

.note { padding-top: 12px; }
.note-t { font-size: 12px; line-height: 1.5; color: var(--muted); }

.empty { padding: 10px 0 4px; }
.empty-t { font-size: 13px; line-height: 1.5; color: var(--muted); }
</style>
