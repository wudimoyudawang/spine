<template>
  <view class="tabbar">
    <view
      v-for="t in TABS"
      :key="t.k"
      class="navi"
      :class="{ 'is-on': db.CURRENT === t.k }"
      @click="pick(t.k)"
    >
      <text class="navi-t">{{ t.t }}</text>
    </view>
    <!-- 记账 / 设置 收进这里。手机上底部栏塞不下第 6 项，
         与其挤成 45px 一颗，不如收进抽屉 —— 这两个是低频入口。 -->
    <view class="navi navi-more" :class="{ 'is-on': moreOn }" @click="moreOn = !moreOn">
      <text class="navi-t">更多</text>
    </view>

    <view v-if="moreOn" class="sheet">
      <view class="sheet-mask" @click="moreOn = false"></view>
      <view class="sheet-box">
        <view class="sheet-h"><text>更多</text></view>
        <view class="sheettabs">
          <view class="navi" :class="{ 'is-on': db.CURRENT === 'ledger' }" @click="pick('ledger')">
            <text class="navi-t">记账</text>
          </view>
          <view class="navi" :class="{ 'is-on': db.CURRENT === 'settings' }" @click="pick('settings')">
            <text class="navi-t">设置</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { db, go } from '../stores/db'

/* 常驻的五项 + 收进抽屉的两项，就是原型的全部七个一级入口，一个不多一个不少。 */
const TABS = [
  { k: 'today', t: '今日' },
  { k: 'inbox', t: '收集' },
  { k: 'notes', t: '随心记' },
  { k: 'spaces', t: '空间' },
  { k: 'review', t: '复盘' }
]

const moreOn = ref(false)

function pick(k) {
  moreOn.value = false
  go(k)
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
.navi-more { border-left: 1px solid var(--line); }
.navi-t { font-size: 11px; }

.sheet {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 60;
}
.sheet-mask {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--mask);
}
.sheet-box {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  background: var(--card);
  border-radius: 14px 14px 0 0;
  padding: 4px 14px calc(14px + env(safe-area-inset-bottom));
  box-shadow: 0 -6px 24px rgba(31, 36, 48, .18);
}
.sheet-h {
  padding: 10px 2px 8px;
  color: var(--sub);
  font-size: 13px;
}
.sheettabs { display: flex; flex-direction: row; }
.sheettabs .navi {
  min-height: 48px;
  margin-right: 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  font-size: 15px;
}
.sheettabs .navi:last-child { margin-right: 0; }
.sheettabs .navi.is-on { color: var(--accent); border-color: var(--accent); }
</style>
