<script setup>
import { onHide, onShow } from '@dcloudio/uni-app'
import { saveState } from './stores/db'
import { syncReminders } from './lib/notify'

/* 每次回到前台就重排一次提醒。为什么在这里而不是只在改数据时：
   排的是「未来 7 天的定点通知」，跨天了就得把窗口往前滚 ——
   不滚的话，七天前的旧排程到期后就没有新的顶上来，提醒悄悄断掉。
   这里一次调用是幂等的（内容没变就不碰原生，见 notify.syncReminders）。 */
onShow(() => {
  syncReminders()
})

onHide(() => {
  /* 退到后台立刻落一次盘。手机上「切走」之后随时可能被系统回收，
     等 2 秒那个定时器往往来不及跑。 */
  saveState(true)
})
</script>

<style lang="scss">
@import './styles/base.scss';
@import './styles/modal.scss';
</style>
