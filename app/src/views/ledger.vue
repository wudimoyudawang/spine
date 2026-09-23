<template>
  <view class="page">
    <PageHead title="记账" />

    <view class="block">
      <view class="block-h">
        <text class="tag">本月</text>
        <text class="block-note">{{ mm.count }} 笔</text>
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

    <!-- 记一笔的入口，输入框在品类那个弹层里（CatSheet）。
         页面上不再常驻一个输入框：打开记账页最常看的是「这个月花了多少」，
         其次才是记一笔 —— 记一笔多一步，换来统计和流水能往上提一截。 -->
    <view class="block qe" @click="catOpen = true">
      <view class="qe-row">
        <text class="qe-k">记一笔 · 品类</text>
        <text class="qe-v">{{ db.CATS.length }} 个品类</text>
        <text class="qe-go">›</text>
      </view>
    </view>

    <CatSheet :on="catOpen" @close="catOpen = false" />

    <view class="block">
      <view class="block-h">
        <text class="tag">最近流水</text>
        <text class="block-note">{{ flow.length }} 笔 · 点一行改</text>
      </view>
      <view v-if="!flow.length" class="empty">
        <text class="empty-t">还没有记过支出</text>
        <text class="empty-t">上面那个框写「32 午餐」就行</text>
      </view>
      <view v-for="l in flow" :key="l.id" class="row">
        <view class="row-main" @click="edit(l)">
          <text class="row-t">{{ l.category || '未分类' }}</text>
          <text class="row-m">{{ fmtCN(l.date) }}</text>
        </view>
        <text class="row-v">{{ money(l.value) }}</text>
        <view class="delbtn" :class="{ 'is-armed': armed === 'money:' + l.id }" @click.stop="del(l)">
          <text class="delbtn-t" :class="{ 'is-armed': armed === 'money:' + l.id }">{{ armed === 'money:' + l.id ? '确认删' : '×' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  db, TODAY, money, fmtCN, sumByCategory, monthMoney,
  openEdit, delArmed
} from '../stores/db'
import PageHead from '../components/PageHead.vue'
import CatSheet from '../components/CatSheet.vue'
import { toast, confirmDelete } from '../lib/ui'

const month = TODAY.slice(0, 7)
const armed = delArmed

/* 明细与合计都从数据层那一份来（见 db.js 的 monthMoney）。
   这一页是唯一需要明细的地方（柱状图），所以它给的就是明细；
   合计不再自己 reduce 一遍 —— 原先三处各扫一遍 db.LOGS 算同一个数。 */
const mm = computed(function () { return monthMoney(month) })

const monthSum = computed(function () { return mm.value.sum })

/* 分类柱状图：按金额从多到少排，最长的那根占满宽度，其余按比例缩。
   高度用百分比而不是算像素 —— 换台屏宽不同的手机不用重算。 */
const bars = computed(function () {
  const by = sumByCategory(mm.value.list)
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

/* 日期那行直接用数据层的 fmtCN —— 原来这里又拼了一遍
   `p[1] + '月' + p[2] + '日 周' + weekdayCN(iso)`，和 fmtCN 逐字等价。
   同一件事两处实现的代价：改格式时只会改一处，两页的日期就长得不一样了。 */

function edit(l) {
  const r = openEdit('money:' + l.id)
  if (r.error) toast(r.error)
}

/* 删除：两段确认。闸门在数据层，这里只说「删掉了要说什么」。
   以前这套「武装 → 删 → 存盘 → 说话」四步在 8 个删除入口各写了一遍。 */
function del(l) {
  const r = confirmDelete('money:' + l.id)
  if (r.armed || r.error) { if (r.msg) toast(r.msg); return }
  toast('已删除')
}

/* 品类弹层开着没有。只有这一页用它，所以是个本地 ref，不进 db ——
   进 db 的都是「换一台设备还得在」或「跨组件要共享」的东西。 */
const catOpen = ref(false)
</script>

<style scoped>

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
.row-v { font-size: 14px; color: var(--text); }

/* × 那颗和 TreeRow 里那颗同一尺寸：同一页面上不同地方的删除钮，
   不该长得像两种东西（一个是一行流水的删除，一个是条目的删除）。 */
.delbtn {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 8px;
}

.empty { padding: 12px 0 16px; }
.empty-t { font-size: 13px; color: var(--muted); }

/* ---- 「记一笔 · 品类」那个入口 ----
   做成一行而不是一块卡片：它是个门，不是内容。
   右边那颗 › 是唯一的方向符号 —— 这一行整块都能点，不需要再加「进入」两个字。 */
.qe:active { background: var(--bg); }
.qe-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 34px;
}
.qe-k { font-size: 14px; color: var(--text); }
.qe-v { margin-left: auto; font-size: 12px; color: var(--muted); }
.qe-go { flex: none; margin-left: 8px; font-size: 15px; color: var(--muted); }
</style>
