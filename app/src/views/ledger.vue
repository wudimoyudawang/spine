<template>
  <view class="page">
    <view class="pagehead"><text class="ph-t">记账</text></view>

    <view class="block">
      <view class="block-h">
        <text class="tag">本月</text>
        <text class="block-note">{{ monthLogs.length }} 笔</text>
      </view>
      <view class="stat">
        <text class="stat-v">{{ money(monthSum) }}</text>
        <text class="stat-s">支出合计</text>
      </view>
      <view v-if="!bars.length" class="empty"><text class="empty-t">这个月还没记账</text></view>
      <view v-for="b in bars" :key="b.n" class="barrow">
        <text class="barrow-n">{{ b.n }}</text>
        <view class="bar"><view class="bar-fill" :style="'width:' + b.w + '%'"></view></view>
        <text class="barrow-v">{{ b.v }}</text>
      </view>
    </view>

    <view class="quick">
      <input
        v-model="draft"
        class="quick-in"
        placeholder="比如 32 午餐，分类可以留空"
        confirm-type="done"
        @confirm="submit"
      />
      <view class="quick-btn" @click="submit"><text class="quick-btn-t">记下</text></view>
    </view>

    <view class="block">
      <view class="block-h"><text class="tag">最近流水</text></view>
      <view v-if="!flow.length" class="empty"><text class="empty-t">还没有记录</text></view>
      <view v-for="l in flow" :key="l.id" class="row">
        <view class="row-main">
          <text class="row-t">{{ l.category || '未分类' }}</text>
          <text class="row-m">{{ dayLabel(l.date) }}</text>
        </view>
        <text class="row-v">{{ money(l.value) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  db, TODAY, money, weekdayCN, sumByCategory, addMoney, guessCategory
} from '../stores/db'

const draft = ref('')
const month = TODAY.slice(0, 7)

const monthLogs = computed(function () {
  return db.LOGS.filter(l => String(l.date).slice(0, 7) === month)
})

const monthSum = computed(function () {
  return monthLogs.value.reduce((s, l) => s + Number(l.value || 0), 0)
})

/* 分类柱状图：按金额从多到少排，最长的那根占满宽度，其余按比例缩。
   高度用百分比而不是算像素 —— 换台屏宽不同的手机不用重算。 */
const bars = computed(function () {
  const by = sumByCategory(monthLogs.value)
  const rows = Object.keys(by).map(function (k) { return { n: k, raw: by[k] } })
  rows.sort(function (a, b) { return b.raw - a.raw })
  const max = rows.length ? rows[0].raw : 0
  return rows.map(function (r) {
    return { n: r.n, v: money(r.raw), w: max ? Math.round(r.raw / max * 100) : 0 }
  })
})

const flow = computed(function () {
  return db.LOGS.slice()
    .sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0) })
    .slice(0, 40)
})

function dayLabel(iso) {
  const p = String(iso).split('-').map(Number)
  return p[1] + '月' + p[2] + '日 周' + weekdayCN(iso)
}

function submit() {
  const t = draft.value.trim()
  if (!t) return
  const m = /^\s*[¥￥]?\s*(\d+(?:\.\d+)?)/.exec(t)
  if (!m) {
    uni.showToast({ title: '开头先写金额', icon: 'none' })
    return
  }
  const rec = addMoney(Number(m[1]), t, guessCategory(t))
  if (!rec) { uni.showToast({ title: '金额不对', icon: 'none' }); return }
  draft.value = ''
  uni.showToast({ title: '记下 ' + money(rec.value), icon: 'none' })
}
</script>

<style scoped>
.page {
  padding: 14px 14px calc(76px + env(safe-area-inset-bottom));
}

.pagehead { padding: 4px 2px 12px; }
.ph-t { font-size: 22px; font-weight: 500; color: var(--text); }

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

.stat { padding: 6px 0 14px; }
.stat-v { display: block; font-size: 30px; font-weight: 500; color: var(--text); line-height: 1.2; }
.stat-s { display: block; margin-top: 2px; font-size: 12px; color: var(--muted); }

.barrow {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 4px 0;
}
.barrow-n { width: 52px; font-size: 12px; color: var(--sub); }
.bar {
  flex: 1 1 auto;
  height: 8px;
  margin: 0 10px;
  background: var(--bg);
  border-radius: 4px;
  overflow: hidden;
}
.bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
.barrow-v { width: 62px; text-align: right; font-size: 12px; color: var(--text); }

.quick {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 14px;
  padding: 6px 6px 6px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.quick-in { flex: 1 1 auto; min-width: 0; height: 34px; }
.quick-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 14px;
  background: var(--accent);
  border-radius: 8px;
}
.quick-btn-t { color: #fff; font-size: 13px; }

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
.row-v { font-size: 14px; color: var(--text); }

.empty { padding: 12px 0 16px; }
.empty-t { font-size: 13px; color: var(--muted); }
</style>
