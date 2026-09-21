<template>
  <view class="sp-root">
    <view class="main">
      <!-- v-show 而不是 v-if：切走再切回来时，滚动位置、输入框里的草稿都还在。
           外面那层 v-if 是懒挂载 —— 第一次进某个页面才把它建起来，
           之后再切回来就只是显隐。7 个视图全量挂载的话，启动时要把整个应用渲染一遍。 -->
      <Today v-if="seen.today" v-show="db.CURRENT === 'today'" />
      <Inbox v-if="seen.inbox" v-show="db.CURRENT === 'inbox'" />
      <Notes v-if="seen.notes" v-show="db.CURRENT === 'notes'" />
      <Spaces v-if="seen.spaces" v-show="db.CURRENT === 'spaces'" />
      <Review v-if="seen.review" v-show="db.CURRENT === 'review'" />
      <Ledger v-if="seen.ledger" v-show="db.CURRENT === 'ledger'" />
      <Settings v-if="seen.settings" v-show="db.CURRENT === 'settings'" />
    </view>

    <TabBar />
  </view>
</template>

<script setup>
import { reactive, watch } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { db, saveState } from '../../stores/db'

import TabBar from '../../components/TabBar.vue'
import Today from '../../views/today.vue'
import Inbox from '../../views/inbox.vue'
import Notes from '../../views/notes.vue'
import Spaces from '../../views/spaces.vue'
import Review from '../../views/review.vue'
import Ledger from '../../views/ledger.vue'
import Settings from '../../views/settings.vue'

/* 懒渲染：第一次进某个页面才把它挂起来，之后再切回来只是显隐。
   7 个视图全量挂载的话，启动时要把整个应用渲染一遍。

   这里**必须从 CURRENT 初始化，不能写死 today**：落地页可能是从存储里恢复出来的
   （上次停在哪儿，这次就开在哪儿）。写死 today 的话，一旦落地页不是今日页，
   watch 不会触发（值没「变」过），那个视图就永远不挂载 —— 表现出来是一片空白。 */
const seen = reactive({})
if (db.CURRENT) seen[db.CURRENT] = true
watch(() => db.CURRENT, function (v) { if (v) seen[v] = true })

let timer = null

onShow(function () {
  /* 每 2 秒兜一次盘。不做「每个改数据的地方都记得存一次」——
     那种写法迟早漏一处，而漏掉的那一处永远是用户刚记的那一笔。 */
  if (timer) clearInterval(timer)
  timer = setInterval(function () { saveState() }, 2000)
  saveState()
})

onHide(function () {
  saveState(true)
  if (timer) { clearInterval(timer); timer = null }
})
</script>

<style scoped>
.main { min-height: 100vh; }
</style>
