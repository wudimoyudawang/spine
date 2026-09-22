<template>
  <view class="ff">
    <!-- 单位：三个等宽按钮。竖排占半屏，横排三个正好 -->
    <view class="urow">
      <view
        v-for="u in FREQ_UNITS"
        :key="u"
        class="ucell"
        :class="{ 'is-on': unit === u }"
        @click="unit = u"
      >
        <text class="ucell-t">{{ u }}</text>
      </view>
    </view>

    <!-- 次数：步进器 + 常用档。1–100 挨个摆要一百颗，
         步进器按一下是一下，常用档把 90% 的选择变成一下 -->
    <view class="steprow">
      <view class="stepb" :class="{ 'is-off': n <= 1 }" @click="step(-1)">
        <text class="stepb-t">−</text>
      </view>
      <text class="stepv">{{ n }} 次</text>
      <view class="stepb" :class="{ 'is-off': n >= 100 }" @click="step(1)">
        <text class="stepb-t">＋</text>
      </view>
    </view>
    <view class="chips">
      <view
        v-for="q in QUICK"
        :key="q"
        class="mchip"
        :class="{ 'is-on': n === q }"
        @click="n = q"
      >
        <text class="mchip-t">{{ q }} 次</text>
      </view>
    </view>
  </view>
</template>

<script setup>
/* 频率字段，内嵌在表单里（不弹窗）：单位 × 次数，两下选完。
 * 存的是那句话（「每天 / 每周 3 次」），value 进、change 出，
 * 父组件不用知道内部长什么样。解析不了的老值（手填的「工作日」）
 * 按默认位显示，但用户不动它就不会写回 —— 原词不被动丢。 */
import { ref, watch } from 'vue'
import { FREQ_UNITS, parseFreq, freqText } from '../stores/db'

const props = defineProps({
  value: { type: String, default: '' }
})
const emit = defineEmits(['change'])

const unit = ref('每日')
const n = ref(1)

const QUICK = [1, 2, 3, 4, 5, 7, 10, 15, 20, 30]

/* 外部值进来同步一次（immediate：弹窗初始就带着值打开）。
   同步不往外发 —— 不然一打开就等于替用户改了一次。 */
watch(() => props.value, function (v) {
  const p = parseFreq(v)
  unit.value = p ? p.unit : '每日'
  n.value = p ? p.n : 1
}, { immediate: true })

function push() {
  emit('change', freqText(unit.value, n.value))
}
function setUnit(u) { unit.value = u; push() }
function step(d) {
  const v = n.value + d
  if (v >= 1 && v <= 100) { n.value = v; push() }
}
</script>

<style scoped>
.ff { padding: 2px 0 4px; }
/* 单位三个等宽，选中的实心 —— 和编辑弹窗里 chips 的选中语言一致 */
.urow { display: flex; flex-direction: row; }
.ucell {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  margin: 0 0 4px 6px;
  padding: 4px 0;
  background: var(--bg);
  border: 1px solid var(--line2);
  border-radius: 9px;
}
.ucell:first-of-type { margin-left: 0; }
.ucell-t { font-size: 14px; color: var(--sub); }
.ucell.is-on { background: var(--accent); border-color: var(--accent); }
.ucell.is-on .ucell-t { color: #fff; }
.ucell:active { opacity: .85; }

/* 步进器：左右两颗大钮，中间的数占中间 —— 手指不用挪地方连按 */
.steprow {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 4px 0 6px;
}
.stepb {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 38px;
  background: var(--bg);
  border: 1px solid var(--line2);
  border-radius: 10px;
}
.stepb-t { font-size: 19px; line-height: 1; color: var(--text); }
.stepb:active { background: var(--accent-bg); }
.stepb.is-off { opacity: .4; }
.stepv {
  flex: 1 1 auto;
  min-width: 0;
  text-align: center;
  font-size: 16px;
  font-weight: 500;
  color: var(--text);
}
</style>
