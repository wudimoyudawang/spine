<template>
  <view class="page">
    <view class="pagehead"><text class="ph-t">空间</text></view>

    <view class="grid">
      <view v-for="d in db.DOMAINS" :key="d.id" class="card" @click="openDomain(d)">
        <view class="card-top">
          <text class="card-t">{{ d.name }}</text>
          <view class="pin" :class="{ 'is-on': d.pinned }" @click.stop="pin(d)">
            <text class="pin-t">{{ d.pinned ? '★' : '☆' }}</text>
          </view>
        </view>
        <text class="card-s">{{ summary(d) }}</text>
      </view>

      <!-- 记账：内置的特殊空间。
           整张卡上**没有任何操作入口** —— 没有置顶的星、没有改名、没有删除。
           它不是 DOMAINS 里的成员，是渲染时多出来的一张卡（见 stores/db.js 的说明）。 -->
      <view class="card card-fixed" @click="openMoney">
        <view class="card-top">
          <text class="card-t">记账</text>
          <text class="card-badge">固定</text>
        </view>
        <text class="card-s">{{ moneySummary }}</text>
      </view>

      <view class="card card-add" @click="add">
        <text class="card-t card-add-t">+ 新建领域</text>
        <text class="card-s">考证 / 育儿 / 副业 …</text>
      </view>
    </view>

    <view class="note">
      <text class="note-t">一张卡就是一个领域，点进去管它下面的习惯、待办和目标。</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import {
  db, go, money, TODAY, summaryOf, recordTypesOf, togglePin, newDomain
} from '../stores/db'

function summary(d) {
  return summaryOf(d, recordTypesOf(db.RECORD_TYPES, d.id).length)
}

const moneySummary = computed(function () {
  const m = TODAY.slice(0, 7)
  const list = db.LOGS.filter(l => String(l.date).slice(0, 7) === m)
  const sum = list.reduce((s, l) => s + Number(l.value || 0), 0)
  return '本月 ' + money(sum) + ' · ' + list.length + ' 笔'
})

function pin(d) {
  const on = togglePin(d.id)
  uni.showToast({ title: on ? '已加到顶部快捷' : '已取消顶部快捷', icon: 'none' })
}

function openDomain() {
  /* 领域详情页（里面的习惯 / 待办 / 目标，带子项树）还没搬过来。
     先如实说一句，别做成点了没反应 —— 那种「不知道是卡了还是没做」最耗人。 */
  uni.showToast({ title: '领域页还没搬过来', icon: 'none' })
}

function openMoney() {
  go('ledger')
}

function add() {
  const d = newDomain()
  uni.showToast({ title: '新建了「' + d.name + '」', icon: 'none' })
}
</script>

<style scoped>
.page {
  /* 底部留白只要让开底部栏。「记一笔」已经进了栏里，
     不再有浮在栏上方的那颗按钮，所以不用再多留 46px。 */
  padding: 14px 14px calc(76px + env(safe-area-inset-bottom));
}

.pagehead { padding: 4px 2px 12px; }
.ph-t { font-size: 22px; font-weight: 500; color: var(--text); }

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.card {
  padding: 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.card:active { background: var(--bg); }
.card-top {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.card-t { font-size: 15px; font-weight: 500; color: var(--text); }
.card-s {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}

.pin { padding: 2px 0 2px 8px; }
.pin-t { font-size: 16px; color: var(--muted); }
.pin.is-on .pin-t { color: var(--warn); }

/* 内置的那张卡：淡蓝底，一眼看出它不是你自己建的 */
.card-fixed { background: var(--accent-bg); border-color: var(--accent); }
.card-badge {
  padding: 1px 6px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  color: var(--accent);
  font-size: 10px;
}

.card-add { border-style: dashed; }
.card-add-t { color: var(--sub); }

.note { padding: 14px 2px 0; }
.note-t { font-size: 12px; line-height: 1.5; color: var(--muted); }
</style>
