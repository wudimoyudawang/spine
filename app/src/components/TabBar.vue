<template>
  <view class="tabbar">
    <view
      v-for="t in LEFT"
      :key="t.k"
      class="navi"
      :class="{ 'is-on': db.CURRENT === t.k }"
      @click="pick(t.k)"
    >
      <text class="navi-t">{{ t.t }}</text>
    </view>

    <!-- 中间那颗加号：点开「记东西」的面板。
         面板里自带一个切换器，在「记一笔」和「记账」之间切 ——
         不在这儿摆两个按钮，是因为底栏这一格只有 60px 宽，
         塞两个入口会把四个 Tab 挤成配角。 -->
    <view class="navi navi-plus" @click="openCapture()">
      <view class="plus"><PlusIcon :size="16" /></view>
    </view>

    <view
      v-for="t in RIGHT"
      :key="t.k"
      class="navi"
      :class="{ 'is-on': db.CURRENT === t.k }"
      @click="pick(t.k)"
    >
      <text class="navi-t">{{ t.t }}</text>
    </view>
  </view>
</template>

<script setup>
import { db, go, openCapture } from '../stores/db'
import PlusIcon from './PlusIcon.vue'

/* 四个 Tab 分列「记一笔」两侧，它正好落在正中间。
   空间和设置不在这儿 —— 它们是右上角那颗齿轮（GearBtn）。 */
const LEFT = [
  { k: 'today', t: '今日' },
  { k: 'inbox', t: '收集' }
]
const RIGHT = [
  { k: 'notes', t: '随心记' },
  { k: 'review', t: '复盘' }
]

function pick(k) { go(k) }
</script>

<style scoped>
.tabbar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  /* 守住手机宽度、水平居中。fixed 元素不跟着 .sp-root 走，得各自带上。
     left:0 + right:0 + 固定 max-width + margin:auto = 居中。 */
  max-width: var(--app-w, 430px);
  margin: 0 auto;
  z-index: 30;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  /* 底部安全区：全面屏手机上不给的话，栏会被小白条盖住 */
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--card);
  border-top: 1px solid var(--line);
}
.navi {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  align-items: center;
  justify-content: center;
  min-height: 54px;
  padding: 4px 2px;
  color: var(--sub);
  font-size: 11px;
  line-height: 1.25;
}
.navi.is-on { color: var(--accent); }
/* 触屏没有 hover，点上去得有反馈，否则会以为没点上 */
.navi:active { background: var(--bg); }
.navi-t { font-size: 11px; }

/* 中间那颗加号：实心圆钮，跟旁边几个纯文字项分开 ——
   光靠颜色区分不行，当前选中的那个 Tab 也是蓝的。

   38px 而不是 44px：底栏 53.8px 高，44px 的圆上下各只剩 5px 余量，
   整栏看着很满；38px 各留 8px，才像这一栏本来就长这样。
   （两种都是严格居中，量过像素 —— 不是位置问题，是尺寸问题。
     这两张对照图在 spine-analysis/shots/zb-70.png 和 zb-70b.png。）

   加号本身走 PlusIcon，全项目一份代码。 */
.plus {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--accent);
  /* 白十字靠这个继承过去 —— PlusIcon 里用的是 currentColor */
  color: #fff;
  box-shadow: 0 2px 8px rgba(47, 111, 235, .28);
}
.navi-plus:active .plus { background: #2A63D2; }
</style>
