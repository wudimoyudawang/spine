<template>
  <view class="seg">
    <view
      v-for="m in list"
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
/* 「一格底下的几个镜头」的通用分段器。**两组在用**（见下面的 GROUPS）：
 *
 *   今日那一格 → 今日 / 日历 / 四象限
 *   收集那一格 → 收集 / 随心记（2026-10-04 加）
 *
 * 为什么不做成底栏的更多格：底栏已经四格加中间一颗加号，再塞就把它们挤成配角
 * （TabBar 里那段注释写着同一个判断）。而同一格底下的这几个本来就是
 * **同一件事的几种看法**，不是一个新的一级模块。
 * 所以底栏那一格在这几个模式下都算选中（见 TabBar 的 FAMILY）。
 *
 * 状态存在 db.CURRENT 上（进了 UI_KEYS），所以切走再回来还停在上次那个镜头。
 *
 * ⚠️ 两组用的是**同一个位置、同一个形状**：切过去的时候这颗分段器不跳，
 * 人才知道自己还在同一格底下。所以「哪几个镜头」只写在这儿一处，
 * 调用方传一个组名 —— 两处各写一份数组的话，「改一下镜头名字」要改两处，
 * 而漏掉的那一半是静默的（那一页只是名字不跟着变）。
 *
 * 第一格的名字和它所属那一格同名（今日那格首格叫「今日」，收集那格首格叫「收集」）——
 * 底下都是「点这一格默认回这儿」，名字不同人反而要重新学一遍。 */
import { computed } from 'vue'
import { db, go } from '../stores/db'

const GROUPS = {
  today: [
    { k: 'today', n: '今日' },
    { k: 'calendar', n: '日历' },
    { k: 'quadrant', n: '四象限' }
  ],
  box: [
    { k: 'inbox', n: '收集' },
    { k: 'notes', n: '随心记' }
  ]
}

const props = defineProps({
  group: { type: String, default: 'today' }
})

const list = computed(function () { return GROUPS[props.group] || GROUPS.today })

function pick(k) { go(k) }
</script>

<style scoped>
/* .seg 那一套在 styles/base.scss，复盘页头和这里共用一份 */
.seg { margin-bottom: 10px; }
</style>
