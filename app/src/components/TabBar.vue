<template>
  <view class="tabbar">
    <view
      v-for="t in LEFT"
      :key="t.k"
      class="navi"
      :class="{ 'is-on': isOn(t.k) }"
      @click="pick(t.k)"
    >
      <text class="navi-t">{{ label(t.k, t.t) }}</text>
    </view>

    <!-- 中间那颗加号：点开「记东西」的面板（只记一笔）。
         记账**不在这里**，它有自己的底栏格 —— 面板里再来一格就是
         两个入口做同一件事（面板底部那格已经撤掉了）。 -->
    <view class="navi navi-plus" @click="openCapture()">
      <view class="plus"><PlusIcon :size="16" /></view>
    </view>

    <view
      v-for="t in RIGHT"
      :key="t.k"
      class="navi"
      :class="{ 'is-on': isOn(t.k) }"
      @click="pick(t.k)"
    >
      <text class="navi-t">{{ label(t.k, t.t) }}</text>
    </view>
  </view>
</template>

<script setup>
import { db, go, openCapture, openPay } from '../stores/db'
import PlusIcon from './PlusIcon.vue'

/* 四个 Tab 分列「记一笔」两侧，它正好落在正中间。
   空间和设置不在这儿 —— 它们是右上角那颗齿轮（GearBtn）。

   ⚠️ **这里是 2 + 1 + 2，不是 4 + 1。** 中间那颗加号要落在正中间，
   左右格数就必须相等；加到 3+1+3 每格只剩 61px，中文两个字就溢出了。
   所以「记账」要占一格，只能是**拿掉一格换来的** ——
   2026-10-04 把「收集」和「随心记」并成了一格（它们本来就是同一件事的
   两种形态：都是「先记下来，回头再说」），腾出来的位置给了记账。 */
const LEFT = [
  { k: 'today', t: '今日' },
  { k: 'inbox', t: '收集' }
]
const RIGHT = [
  { k: 'ledger', t: '记账' },
  { k: 'review', t: '复盘' }
]

/* 一格底下的镜头。它们不是一个新的一级模块，所以在哪一格上都得亮那一格 ——
   不这么写的话，切到日历底栏就四个格子全灰，看着像没在任何一页上。 */
const FAMILY = {
  today: ['today', 'calendar', 'quadrant'],
  /* 收集那一格底下是收件箱和随心记（页头分段器切）。 */
  inbox: ['inbox', 'notes'],
  /* 记账那一格底下是记一笔和记账页。 */
  ledger: ['pay', 'ledger']
}

function isOn(k) {
  const fam = FAMILY[k]
  if (fam) return fam.indexOf(db.CURRENT) >= 0
  return db.CURRENT === k
}

/* 「收集」那一格带**未归类条数**。
   这是它并成一格之后必须补上的东西：收件箱里堆着 5 条没归类，
   如果底栏上看不出来，「先记下来别丢」就变成了「记下来就忘了」。
   随心记**不计数** —— 无红点、不催人是它刻意的气质（见 PROMPT 第 2 节）。 */
function label(k, t) {
  if (k !== 'inbox') return t
  const n = db.INBOX.length
  return n ? t + ' ' + n : t
}

/* 点一格落在它底下的**默认镜头**上。
   今日和收集的默认镜头就是第一格；记账那格也是第一格 ——
   只是第一格叫「记一笔」不叫「记账」（宇定的：记账最高频的动作是记一笔）。
   所以它走 `openPay('out')`：既落到那一页，也把方向归零成「支出」。 */
function pick(k) {
  if (k === 'ledger') { openPay('out'); return }
  go(k)
}
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
  min-height: var(--tabbar-h, 54px);
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
