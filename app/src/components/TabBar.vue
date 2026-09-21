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

    <!-- 空间和设置收进这里。底部栏要留给天天用的那几个 ——
         空间是「偶尔进去整理一下」的地方，不该占一个常驻位。 -->
    <view class="navi navi-more" :class="{ 'is-on': moreOn }" @click="moreOn = !moreOn">
      <text class="navi-t">更多</text>
    </view>

    <!-- 记一笔：主操作，放最右端 —— 右手单手持机时那儿最容易够到。
         它不切页，是把今日页的速记框叫出来并把光标放进去。 -->
    <view class="navi navi-cap" @click="pickCapture">
      <text class="navi-t navi-cap-t">记一笔</text>
    </view>

    <view v-if="moreOn" class="sheet">
      <view class="sheet-mask" @click="moreOn = false"></view>
      <view class="sheet-box">
        <view class="sheet-h"><text>更多</text></view>
        <view class="sheettabs">
          <view class="navi" :class="{ 'is-on': db.CURRENT === 'spaces' }" @click="pick('spaces')">
            <text class="navi-t">空间</text>
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
import { db, go, askCapture } from '../stores/db'

/* 常驻四项 + 更多 + 记一笔。
   原型的七个一级入口现在这样分：今日 / 收集 / 随心记 / 复盘 常在栏里；
   空间、设置 进「更多」；记账不再是独立入口 —— 它是空间里的一个特殊空间。 */
const TABS = [
  { k: 'today', t: '今日' },
  { k: 'inbox', t: '收集' },
  { k: 'notes', t: '随心记' },
  { k: 'review', t: '复盘' }
]

const moreOn = ref(false)

function pick(k) {
  moreOn.value = false
  go(k)
}

function pickCapture() {
  moreOn.value = false
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
.navi-more { border-left: 1px solid var(--line); }
.navi-t { font-size: 11px; }

/* 主操作：给它一颗实心胶囊，跟旁边几个纯文字项分开。
   光靠颜色区分不行 —— 当前选中的那个 Tab 也是蓝的。 */
.navi-cap-t {
  padding: 6px 13px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-weight: 500;
}
.navi-cap:active .navi-cap-t { background: #2A63D2; }

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
