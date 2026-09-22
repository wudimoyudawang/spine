<template>
  <view class="seg">
    <view
      v-for="m in MODES"
      :key="m.k"
      class="seg-b"
      :class="{ 'is-on': db.CURRENT === m.k }"
      @click="pick(m.k)"
    >
      <text class="seg-t">{{ m.n }}</text>
    </view>
  </view>
</template>

<script setup>
/* 今日这一格底下的三个镜头。
 *
 * 为什么不做成底栏的两格：底栏已经四格加中间一颗加号，再塞就把它们挤成配角了
 * （TabBar 里那段注释写着同一个判断）。而这三个本来就是**同一批事的三个焦距** ——
 * 今日是这一天，日历是这个月，四象限是全部还没做完的 —— 不是一个新的一级模块。
 *
 * 所以底栏那格「今日」在这三个模式下都算选中（见 TabBar 的 isOn）。
 *
 * 状态存在 db.CURRENT 上（进了 UI_KEYS），所以切走再回来还停在上次那个镜头。 */
import { db, go } from '../stores/db'

const MODES = [
  { k: 'today', n: '今日' },
  { k: 'calendar', n: '日历' },
  { k: 'quadrant', n: '四象限' }
]

function pick(k) { go(k) }
</script>

<style scoped>
/* .seg 那一套在 styles/base.scss，复盘页头和这里共用一份 */
.seg { margin-bottom: 10px; }
</style>
