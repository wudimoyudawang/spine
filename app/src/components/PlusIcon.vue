<template>
  <!-- 全项目唯一的那个加号。
       以前有三套画法：底栏圆钮里的双线、行内虚线框里的细十字、以及文字「+」，
       粗细和比例各不相同，凑在一屏上就看得出不是一个来源。
       统一成这一份：端点圆头、线宽固定 2px、尺寸只有 14 / 16 两档。

       为什么用 SVG 不用「+」字符：字符的字形和基线跟着字体走，各机型不一致；
       而且字号一变粗细就跟着变，没法保证各处看起来是同一个东西。 -->
  <svg
    class="pi"
    :style="'width:' + size + 'px;height:' + size + 'px'"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
  >
    <path d="M8 3v10M3 8h10" />
  </svg>
</template>

<script setup>
/* size 只给 14 和 16 两档。要第三档之前先想清楚：
   加号在同一个界面里出现三种尺寸，就又回到「不是一个来源」了。 */
defineProps({
  size: { type: Number, default: 16 }
})
</script>

<style scoped>
.pi {
  display: block;
  flex: none;
}
</style>
