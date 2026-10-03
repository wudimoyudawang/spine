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

    <!-- 收集在**正中间**。那颗「＋」的位置原本就在这里 —— 2026-10-04 把它挪进了
         收集页（收集页顶部就是一个「想记什么就写什么」的框），
         于是「先记下来」这件事的位置没变，只是换了一种做法。 -->
    <view class="navi" :class="{ 'is-on': isOn(MID.k) }" @click="pick(MID.k)">
      <text class="navi-t">{{ label(MID.k, MID.t) }}</text>
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
import { db, go, openPay } from '../stores/db'

/* 三格：**今日 / 收集 / 记账**。
 *
 * 2026-10-04 从五格（今日|收集|＋|记账|复盘）改过来，两处腾挪：
 *   · **「＋」挪进收集页**（宇：加号的功能放到收集页面里面）。
 *     那个弹层从此不存在了 —— 收集页顶部就是那个「想记什么就写什么」的框。
 *   · **「复盘」挪进今日页第一排**（和 今日/日历/四象限 同一颗分段器）。
 *     它本来就是「回头看看」，和那三个是同一类东西。
 *
 * 为什么「收集」落在**正中间**：三格是对称的，中间那格天然是它 ——
 * 而这正好是原来那颗加号的位置（拇指最容易够到的地方），
 * 「先记下来」这件事的地位没动。 */
const LEFT = [{ k: 'today', t: '今日' }]
const MID = { k: 'inbox', t: '收集' }
const RIGHT = [{ k: 'ledger', t: '记账' }]

/* 一格底下的镜头。它们不是一个新的一级模块，所以在哪一格上都得亮那一格 ——
   不这么写的话，切到日历底栏就三格全灰，看着像没在任何一页上。 */
const FAMILY = {
  today: ['today', 'calendar', 'quadrant', 'review'],
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
   收件箱里堆着 5 条没归类、而底栏上看不出来，「先记下来别丢」就变成了
   「记下来就忘了」。随心记**不计数** —— 无红点、不催人是它刻意的气质
   （见 PROMPT 第 2 节）。 */
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

/* ⚠️ 这里原来还有 `.plus` / `.navi-plus`（中间那颗凸起的加号圆钮）。
   2026-10-04 加号的功能挪进收集页之后**删掉了**，那些样式跟着一起走。
   （那条注释里记着「38px 而不是 44px」的理由。谁要把圆钮搬回来，
   记得那句：底栏 53.8px 高时 44px 的圆上下各只剩 5px 余量，整栏看着很满。） */
</style>
