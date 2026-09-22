<template>
  <view class="bill">
    <view v-if="!bill.count" class="bill-none">
      <text class="bill-none-t">{{ name }}还没有记账</text>
    </view>
    <template v-else>
      <view class="bill-h">
        <text class="bill-l">{{ name }}支出</text>
        <text class="bill-v">{{ money(bill.sum) }}</text>
        <text class="bill-n">· {{ bill.count }} 笔</text>
      </view>
      <view class="bchips">
        <view v-for="c in top" :key="c.name" class="bchip">
          <text class="bchip-t">{{ c.name }} {{ money(c.sum) }}</text>
        </view>
        <!-- 「其余 N 类」不能省：不写的话，前三类的钱加起来对不上合计，
             人会以为哪里漏记了。 -->
        <view v-if="rest" class="bchip is-rest">
          <text class="bchip-t">其余 {{ rest.n }} 类 {{ money(rest.sum) }}</text>
        </view>
      </view>
      <text v-if="diffText" class="bill-d" :class="diffClass">{{ diffText }}</text>
    </template>
  </view>
</template>

<script setup>
/* 一段时间的账单汇总条。日历的月视图和周视图各要一条，
 * 位置还不一样（周视图在顶端、月视图在网格下面）——
 * 两处各抄一份标记的话，「加一类」这种改动迟早只改了一处。
 * 所以收成组件，差异只通过 name / prevName 传进来。
 *
 * 「对比上期」最容易被做错的地方在这儿：上一期一笔都没记时，
 * 不能拿 0 当分母算出「多了 100%」—— 那种数会让人以为账坏了。
 * 所以上一期为 0 时直说，不算比例。
 * 方向为 null 表示「算不出来」—— 那种情况下不上色（默认灰）。 */
import { computed } from 'vue'
import { money } from '../stores/db'

const props = defineProps({
  bill: { type: Object, required: true },
  name: { type: String, default: '本期' },
  prevName: { type: String, default: '上期' }
})

const top = computed(function () { return props.bill.cats.slice(0, 3) })

const rest = computed(function () {
  const c = props.bill.cats
  if (c.length <= 3) return null
  let sum = 0
  for (let i = 3; i < c.length; i++) sum += c[i].sum
  return { n: c.length - 3, sum: Math.round(sum * 100) / 100 }
})

const diff = computed(function () {
  const b = props.bill
  if (!b.prevCount) return null
  return Math.round((b.sum - b.prev) * 100) / 100
})

const diffText = computed(function () {
  const b = props.bill
  if (!b.prevCount && !b.count) return ''
  if (!b.prevCount) return props.prevName + '没有记账，没法比'
  const d = diff.value
  if (d === 0) return '和' + props.prevName + '一样'
  return '比' + props.prevName + (d > 0 ? '多 ' : '少 ') + money(Math.abs(d))
})

const diffClass = computed(function () {
  const d = diff.value
  if (d === null || d === 0) return ''
  return d > 0 ? 'is-up' : 'is-down'
})
</script>

<style scoped>
/* 一条横贯的窄条，不是卡片：它是这一期的属性，和上面的网格是一体，
   做成卡片会让人觉得它是另一个模块。 */
.bill {
  margin: 2px 0 14px;
  padding: 9px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.bill-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
}
.bill-l { flex: none; font-size: 12px; color: var(--sub); }
.bill-v { margin-left: 6px; font-size: 15px; font-weight: 500; color: var(--text); }
.bill-n { margin-left: 5px; font-size: 11px; color: var(--muted); }
.bchips {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  margin-top: 7px;
}
.bchip {
  margin: 0 6px 5px 0;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg);
}
.bchip-t { font-size: 11px; color: var(--sub); }
.bchip.is-rest { background: transparent; border: 1px dashed var(--line2); }
.bchip.is-rest .bchip-t { color: var(--muted); }
/* 多花了 = 橙（要留意），少花了 = 绿（省下了）。
   这不是股市那套红涨绿跌 —— 那是看价格涨跌，这里是看支出多少，
   「多」在这里不是好事，用红会读成「赚了」。
   默认是**灰**而不是绿：「上月没有记账，没法比」这种中性的句子不该带颜色，
   染成绿会读成「省下了」。只有真的算出方向来才上色。 */
.bill-d { display: block; margin-top: 2px; font-size: 11px; color: var(--muted); }
.bill-d.is-up { color: var(--warn); }
.bill-d.is-down { color: var(--ok); }
.bill-none { padding: 1px 0; }
.bill-none-t { font-size: 12px; color: var(--muted); }
</style>
