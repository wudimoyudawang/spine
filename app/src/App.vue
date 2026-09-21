<script setup>
import { onHide, onShow } from '@dcloudio/uni-app'
import { saveState } from './stores/db'

onShow(() => {})

onHide(() => {
  /* 退到后台立刻落一次盘。手机上「切走」之后随时可能被系统回收，
     等 2 秒那个定时器往往来不及跑。 */
  saveState(true)
})
</script>

<style lang="scss">
@import './styles/base.scss';
</style>
