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

    <!-- 底部中间那颗「记一笔」。这一轮先切回今日页（速记框在那儿），
         下一轮改成从底部升起的弹层，让它在任何页面上都能直接开。 -->
    <view class="fab" @click="openCapture"><text class="fab-t">记一笔</text></view>

    <TabBar />
  </view>
</template>

<script setup>
import { reactive, watch } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { db, go, saveState } from '../../stores/db'

import TabBar from '../../components/TabBar.vue'
import Today from '../../views/today.vue'
import Inbox from '../../views/inbox.vue'
import Notes from '../../views/notes.vue'
import Spaces from '../../views/spaces.vue'
import Review from '../../views/review.vue'
import Ledger from '../../views/ledger.vue'
import Settings from '../../views/settings.vue'

const seen = reactive({ today: true })
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

function openCapture() {
  go('today')
  uni.pageScrollTo({ scrollTop: 0, duration: 200 })
}
</script>

<style scoped>
.main { min-height: 100vh; }

.fab {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  /* 72px = 底部栏 54px + 一点间距，刚好浮在栏上方不被挡住 */
  bottom: calc(72px + env(safe-area-inset-bottom));
  z-index: 35;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 46px;
  padding: 0 24px;
  border-radius: 23px;
  background: var(--accent);
  box-shadow: 0 4px 14px rgba(47, 111, 235, .3);
}
.fab-t { color: #fff; font-size: 14px; font-weight: 500; }
.fab:active { background: #2A63D2; }
</style>
