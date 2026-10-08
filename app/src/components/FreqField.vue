<template>
  <view class="ff">
    <!-- 单位：三个等宽按钮。竖排占半屏，横排三个正好 -->
    <view class="urow">
      <view
        v-for="u in FREQ_UNITS"
        :key="u"
        class="ucell"
        :class="{ 'is-on': unit === u }"
        @click="setUnit(u)"
      >
        <text class="ucell-t">{{ u }}</text>
      </view>
    </view>

    <!-- 星期几：**只在「每周」时出现**。
         它是「每周」的另一种写法，不是第四种单位 —— 摆成第四颗按钮的话，
         人会以为频率有四种，而「每周三」和「每周 3 次」说的是同一件事的两个方向
         （前者是排在哪天，后者是随便哪天做三次）。 -->
    <template v-if="unit === '每周'">
      <view class="days">
        <view
          v-for="d in DAYS"
          :key="d.v"
          class="dayb"
          :class="{ 'is-on': days.indexOf(d.v) >= 0 }"
          @click="toggleDay(d.v)"
        >
          <text class="dayb-t">{{ d.t }}</text>
        </view>
      </view>
      <view class="chips">
        <view class="mchip" :class="{ 'is-on': isWorkday }" @click="pickDays('work')">
          <text class="mchip-t">工作日</text>
        </view>
        <view class="mchip" :class="{ 'is-on': isWeekend }" @click="pickDays('weekend')">
          <text class="mchip-t">周末</text>
        </view>
        <text class="days-hint">{{ days.length ? daysText(days) : '不选就按次数' }}</text>
      </view>
    </template>

    <!-- 次数：步进器 + 常用档。1–100 挨个摆要一百颗，
         步进器按一下是一下，常用档把 90% 的选择变成一下。
         **选了星期几就藏起来** —— 那时候次数就是选中的天数，
         再摆一个能改的次数，两处说的不是一回事。 -->
    <template v-if="!days.length">
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
          @click="setN(q)"
        >
          <text class="mchip-t">{{ q }} 次</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
/* 频率字段，内嵌在表单里（不弹窗）：单位 × 次数，两下选完。
 * 存的是那句话（「每天 / 每周 3 次 / 每周一、四」），value 进、change 出，
 * 父组件不用知道内部长什么样。解析不了的老值（手填的「工作日」）
 * 按默认位显示，但用户不动它就不会写回 —— 原词不被动丢。
 *
 * ⚠️ **星期几走 `habitDays` 读，不经过 `parseFreq`**（2026-10-08 加这一行时定的）：
 *   · `parseFreq` 必须**严格** —— 它认得出来的东西，界面上会被改写成
 *     `freqText(unit, n)`。让它认「工作日」的话，用户手填的那三个字
 *     碰一下按钮就没了，而「不动滚轮就不冲掉手填的词」是这个组件的老规矩。
 *   · `habitDays` 是**读**，它认识「工作日 / 周末 / 每天」，正合适。
 * 两个分开之后还多出一个好处：手填的「工作日」打开时五颗按钮是亮的，
 * 用户点一下别的再点回来，写出去的还是「工作日」——**一个字节都没变**。 */
import { computed, ref, watch } from 'vue'
import { FREQ_UNITS, parseFreq, freqText, habitDays, daysText } from '../stores/db'

const props = defineProps({
  value: { type: String, default: '' }
})
const emit = defineEmits(['change'])

const unit = ref('每日')
const n = ref(1)
/* 排在哪几天（空数组 = 没排，走「每周 N 次」那条老路） */
const days = ref([])

const QUICK = [1, 2, 3, 4, 5, 7, 10, 15, 20, 30]
const DAYS = [
  { v: 1, t: '一' }, { v: 2, t: '二' }, { v: 3, t: '三' }, { v: 4, t: '四' },
  { v: 5, t: '五' }, { v: 6, t: '六' }, { v: 7, t: '日' }
]

const isWorkday = computed(function () { return daysText(days.value) === '工作日' })
const isWeekend = computed(function () { return daysText(days.value) === '周末' })

/* 外部值进来同步一次（immediate：弹窗初始就带着值打开）。
   同步不往外发 —— 不然一打开就等于替用户改了一次。 */
watch(() => props.value, function (v) {
  const p = parseFreq(v)
  unit.value = p ? p.unit : '每日'
  n.value = p ? p.n : 1
  /* 「每天」也认得出七天，但它属于「每天」那一档，不点亮七颗 ——
     `unit` 不是「每周」就一律不显示星期那一段。 */
  days.value = unit.value === '每周' ? (habitDays(v) || []) : []
}, { immediate: true })

function push() {
  /* 排了星期就写那句话（`每周一、四` / `工作日` / `周末`），
     没排就还是「每周 N 次」。两种写法 `habitDays` 都认识，
     但只有前者知道自己排在哪几天。 */
  emit('change', days.value.length ? daysText(days.value) : freqText(unit.value, n.value))
}
/* 单位 / 次数这两个改动**必须走 push()**。
   之前模板里写的是直接赋值（`@click="unit = u"`），赋值确实能生效、选中态也
   会高亮，但 `emit('change')` 整条链断掉 —— 父组件的值保持原样。
   表现出来就是「点了『每周』，保存下去还是『每天』」，而且再碰一下 ± 步进器
   又正常了（那条路本来就走 push）。静默存错数据，比报错难查得多。 */
function setUnit(u) {
  if (unit.value === u) return
  unit.value = u
  /* 换走「每周」就把星期清掉 —— 留着的话「每天 + 每周一、四」两个说法同时成立，
     而 push() 会优先写星期那句，单位那三颗的选中态就成了摆设。 */
  if (u !== '每周') days.value = []
  push()
}
function setN(v) {
  if (n.value === v) return
  n.value = v
  push()
}
function step(d) {
  const v = n.value + d
  if (v >= 1 && v <= 100) { n.value = v; push() }
}

/* 点某一天：开 / 关。全关掉就自动回到「每周 N 次」那一行（下面那段 v-if）——
   不需要另设一颗「清空」，再点一下那颗亮的就行。 */
function toggleDay(d) {
  const i = days.value.indexOf(d)
  if (i >= 0) days.value.splice(i, 1)
  else days.value.push(d)
  days.value = days.value.slice().sort(function (a, b) { return a - b })
  push()
}
function pickDays(kind) {
  const want = kind === 'work' ? [1, 2, 3, 4, 5] : [6, 7]
  const same = daysText(days.value) === (kind === 'work' ? '工作日' : '周末')
  days.value = same ? [] : want    /* 再点一下取消 */
  push()
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

/* 七个星期：等宽平分，比单位那三颗矮一点 ——
   它是「每周」底下的第二层，不该和单位一样重。 */
.days {
  display: flex;
  flex-direction: row;
  margin: 2px 0 2px;
}
.dayb {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  margin-left: 4px;
  background: var(--bg);
  border: 1px solid var(--line2);
  border-radius: 8px;
}
.dayb:first-of-type { margin-left: 0; }
.dayb-t { font-size: 13px; color: var(--sub); }
.dayb.is-on { background: var(--accent-bg); border-color: var(--accent); }
.dayb.is-on .dayb-t { color: var(--accent); font-weight: 500; }
.dayb:active { opacity: .85; }

.days-hint { margin-left: 4px; font-size: 11px; color: var(--muted); }

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
/* chips 那一排（常用档 / 工作日 / 周末）在弹窗的 .chips 里已经有一份，
   这里不重复定义 —— 组件是不带 .modal 的，所以只补最小的一条。 */
.chips { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; }
.mchip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 14px;
  margin: 0 8px 6px 0;
  border-radius: 15px;
  background: var(--bg);
}
.mchip-t { font-size: 12px; color: var(--sub); }
.mchip.is-on { background: var(--accent); }
.mchip.is-on .mchip-t { color: #fff; }
</style>
