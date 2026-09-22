<template>
  <!-- 领域页的「‹ 空间」放在标题上面，所以留一个插槽 -->
  <slot name="above" />
  <view class="hd-row">
    <text class="hd-t">{{ title }}</text>
    <view class="hd-acts">
      <!-- 存储状态常驻页头：存没存上不该靠往下滑去找，那会让人默认它就是存上了 -->
      <text v-if="save.text" class="hd-save" :class="{ 'is-bad': save.bad }">{{ save.text }}</text>
      <!-- 搜索是全局的：不管在哪个页，找的都是同一台设备上的东西。
           所以放在所有页面共用的页头上，而不是某一个页面里。 -->
      <view class="hdbtn" @click="searchOpen = true">
        <svg class="hdbtn-svg" viewBox="0 0 20 20">
          <circle cx="8.5" cy="8.5" r="5.6" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M12.9 12.9 L17.2 17.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </view>
      <GearBtn />
    </view>
  </view>
  <text v-if="sub" class="hd-s">{{ sub }}</text>

  <SearchSheet :on="searchOpen" @close="searchOpen = false" />
</template>

<script setup>
/* 每个页面都用这一个页头。
   以前那 7 份 .pagehead / .ph-t 是各写各的，其中还夹着一句
   `padding-right: 46px` —— 那是给「浮在右上角的齿轮」让位的补丁。
   齿轮现在是这一行里的一个元素，补丁不需要了，7 份样式也收成了一份。 */
import { ref, computed } from 'vue'
import GearBtn from './GearBtn.vue'
import SearchSheet from './SearchSheet.vue'
import { saveStateText } from '../stores/db'

defineProps({
  title: String,
  /* 副标题。今日页拿它放日期 */
  sub: String
})

const searchOpen = ref(false)
const save = computed(function () { return saveStateText() })
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
.hd-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
}
/* 存储状态那一小句。平时是灰的（它不值得一提），存失败才转红。
   放在搜索/齿轮的左边：它是状态，不是动作，不该和动作挤在一起。 */
.hd-save { margin-right: 8px; font-size: 11px; color: var(--muted); }
.hd-save.is-bad { color: var(--danger); font-weight: 500; }
/* 搜索那颗和齿轮同宽同距，两个并排才不会一个高一个矮 */
.hdbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-right: 6px;
  color: var(--sub);
}
.hdbtn-svg { width: 19px; height: 19px; display: block; }
.hdbtn:active { color: var(--accent); }
</style>
