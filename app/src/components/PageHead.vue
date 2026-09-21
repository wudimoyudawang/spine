<template>
  <view class="hd">
    <!-- 领域页的「‹ 空间」放在标题上面，所以留一个插槽 -->
    <slot name="above" />
    <view class="hd-row">
      <text class="hd-t">{{ title }}</text>
      <GearBtn />
    </view>
    <text v-if="sub" class="hd-s">{{ sub }}</text>
  </view>
</template>

<script setup>
/* 每个页面都用这一个页头。
   以前那 7 份 .pagehead / .ph-t 是各写各的，其中还夹着一句
   `padding-right: 46px` —— 那是给「浮在右上角的齿轮」让位的补丁。
   齿轮现在是这一行里的一个元素，补丁不需要了，7 份样式也收成了一份。 */
import GearBtn from './GearBtn.vue'

defineProps({
  title: String,
  /* 副标题。今日页拿它放日期 */
  sub: String
})
</script>

<style scoped>
.hd { padding: 4px 2px 12px; }
.hd-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.hd-t { font-size: 22px; font-weight: 500; color: var(--text); }
.hd-s {
  display: block;
  margin-top: 3px;
  font-size: 13px;
  color: var(--sub);
}
</style>
