<template>
  <!-- 齿轮是「空间」唯一的入口（底栏那四项之外它是唯一的路），所以每个页面都有。

       **它是页头那一行里的一个元素，不是浮在页面上的层。**
       早先那版是 position:fixed —— 往下滚时卡片会从它下面穿过去，
       正好盖住行尾的 `×` / `+`。挪进页头之后这个问题从根上没了。

       图标用 inline SVG 而不是 ⚙ 字符：字符在不同设备上字形差别很大，
       有的还会被渲染成彩色 emoji，控件的样子不该由系统决定。 -->
  <view class="gear" :class="{ 'is-on': db.CURRENT === 'spaces' }" @click="open">
    <svg class="gear-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  </view>
</template>

<script setup>
import { db, go } from '../stores/db'

function open() {
  go('spaces')
  /* 从别的页面点进来时，要停在「空间」那一段的顶上，
     不能停在上次滚到的地方 —— 那个位置属于上一次，不是这一次想看的。 */
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}
</script>

<style scoped>
.gear {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: var(--sub);
  /* 图标缩在 34px 的盒子里，右边缘本来会离容器边 7px。
     拉回来 7px，图标的光学右边缘就落在和标题左边缘一样的 2px 上。
     点按区域仍然是整个 34px 的盒子，不用缩。 */
  margin-right: -7px;
}
.gear:active { background: var(--bg); }
.gear.is-on { color: var(--accent); }
.gear-ico { width: 20px; height: 20px; display: block; }
</style>
