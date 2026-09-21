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

    <!-- 记一笔居中。它不切页 —— 按下去把今日页的速记框叫出来，光标直接落进输入框。 -->
    <view class="navi navi-cap" @click="pickCapture">
      <text class="navi-t navi-cap-t">记一笔</text>
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
import { db, go, askCapture } from '../stores/db'

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

function pickCapture() {
  go('today')
  askCapture()
}
</script>

<style scoped>
.tabbar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
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

/* 主操作：实心胶囊，跟旁边几个纯文字项分开。
   光靠颜色区分不行 —— 当前选中的那个 Tab 也是蓝的。 */
.navi-cap-t {
  padding: 7px 16px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-weight: 500;
}
.navi-cap:active .navi-cap-t { background: #2A63D2; }
</style>
