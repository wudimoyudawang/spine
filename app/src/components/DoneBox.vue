<template>
  <!-- 点按区域比那个方框大一圈：方框本身只有 17px，手指点不准，
       而这一下点歪了是「没完成」和「完成了」的区别。 -->
  <view class="cbox" @click.stop="$emit('toggle')">
    <view class="cbox-box" :class="{ 'is-on': on }">
      <svg v-if="on" class="cbox-tick" viewBox="0 0 16 16">
        <path d="M3.4 8.6l3.1 3.1 6.1-6.6" fill="none" stroke="#fff"
              stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </view>
  </view>
</template>

<script setup>
/* 待办的勾选框。今日页原本在「逾期」和「待办」两个区块里各写了一份一模一样的，
   日历和四象限还要用 —— 四份的话，「勾选样式改一下」要改四处，漏一处就长得不一样。
   部件自己的 click 带 .stop：点方框不该顺带把整行点开（那是编辑）。 */
defineProps({
  on: { type: Boolean, default: false }
})
defineEmits(['toggle'])
</script>

<style scoped>
.cbox {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-right: 2px;
}
.cbox-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border: 1.5px solid var(--line2);
  border-radius: 4px;
  background: var(--card);
}
.cbox-box.is-on { background: var(--ok); border-color: var(--ok); }
.cbox-tick { width: 11px; height: 11px; display: block; }
</style>
