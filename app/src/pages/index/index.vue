<template>
  <!-- 四象限的四个颜色从这儿注入（CSS 变量是继承的），
       所以下面的每一个视图、每一个组件读到的都是同一份。 -->
  <view class="sp-root" :style="quadVars">
    <view class="main">
      <!-- v-show 而不是 v-if：切走再切回来时，滚动位置、输入框里的草稿都还在。
           外面那层 v-if 是懒挂载 —— 第一次进某个页面才把它建起来，
           之后再切回来就只是显隐。9 个视图全量挂载的话，启动时要把整个应用渲染一遍。 -->
      <Today v-if="seen.today" v-show="db.CURRENT === 'today'" />
      <!-- 今日 / 日历 / 四象限是同一批事的三个焦距，由今日页头那颗分段器切。
           它们是三个视图而不是一个视图里的三块，因为三者的取数口径都不一样
           （今天 / 这个月 / 全部未完成），塞进一个组件就得在里面判三次。 -->
      <Calendar v-if="seen.calendar" v-show="db.CURRENT === 'calendar'" />
      <Quadrant v-if="seen.quadrant" v-show="db.CURRENT === 'quadrant'" />
      <Inbox v-if="seen.inbox" v-show="db.CURRENT === 'inbox'" />
      <Notes v-if="seen.notes" v-show="db.CURRENT === 'notes'" />
      <Spaces v-if="seen.spaces" v-show="db.CURRENT === 'spaces'" />
      <Review v-if="seen.review" v-show="db.CURRENT === 'review'" />
      <Ledger v-if="seen.ledger" v-show="db.CURRENT === 'ledger'" />
      <Domain v-if="seen.domain" v-show="db.CURRENT === 'domain'" />
    </view>

    <CaptureSheet />
    <AddSheet />
    <EditSheet />
    <GoalSheet />
    <TabBar />
  </view>
</template>

<script setup>
import { reactive, watch, computed } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { db, saveState, quadVarStyle } from '../../stores/db'

import TabBar from '../../components/TabBar.vue'
import CaptureSheet from '../../components/CaptureSheet.vue'
import AddSheet from '../../components/AddSheet.vue'
import EditSheet from '../../components/EditSheet.vue'
import GoalSheet from '../../components/GoalSheet.vue'
import Today from '../../views/today.vue'
import Calendar from '../../views/calendar.vue'
import Quadrant from '../../views/quadrant.vue'
import Inbox from '../../views/inbox.vue'
import Notes from '../../views/notes.vue'
import Spaces from '../../views/spaces.vue'
import Review from '../../views/review.vue'
import Ledger from '../../views/ledger.vue'
import Domain from '../../views/domain.vue'

/* 懒渲染：第一次进某个页面才把它挂起来，之后再切回来只是显隐。
   7 个视图全量挂载的话，启动时要把整个应用渲染一遍。

   这里**必须从 CURRENT 初始化，不能写死 today**：落地页可能是从存储里恢复出来的
   （上次停在哪儿，这次就开在哪儿）。写死 today 的话，一旦落地页不是今日页，
   watch 不会触发（值没「变」过），那个视图就永远不挂载 —— 表现出来是一片空白。 */
const seen = reactive({})
if (db.CURRENT) seen[db.CURRENT] = true
watch(() => db.CURRENT, function (v) { if (v) seen[v] = true })

/* 四象限配色的那串 CSS 变量。写在根上一处，三个用到颜色的地方跟着一起变。 */
const quadVars = computed(function () { return quadVarStyle() })

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
