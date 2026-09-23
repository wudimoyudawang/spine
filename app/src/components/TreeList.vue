<template>
  <view class="tree">
    <!-- 行壳（TreeRow）的装配只写这一处。之前今日页和领域页各写了三遍同样的
         九行绑定（depth / kids / closed / add-on / armed / fold / open / add / sub / del）——
         六个使用点、五十四行纯样板，给行壳加一个 prop 要改六处。 -->
    <TreeRow
      v-for="r in rows"
      :key="r.node.id"
      :depth="r.depth"
      :kids="r.kids"
      :closed="r.closed"
      :add-on="subOn === r.spec"
      :armed="armed === r.spec"
      :bar="bar ? bar(r) : ''"
      :add-ph="typeof addPh === 'function' ? addPh(r) : addPh"
      @fold="fold(r)"
      @open="$emit('open', r.spec)"
      @add="armAdd(r.spec)"
      @sub="(t) => commitSub(r.spec, t)"
      @del="del(r)"
    >
      <!-- 前导位：待办的勾选框 -->
      <template #lead><slot name="lead" :row="r" /></template>
      <!-- 正文（名称那两行）由父组件给 —— 三类行长得不一样 -->
      <slot :row="r" />
      <!-- 行尾：默认给习惯行的打卡按钮；计划行要用进度条就自己填这个插槽 -->
      <template #tail>
        <slot name="tail" :row="r">
          <view v-if="tickable" class="tickbox">
            <view class="tick" :class="{ 'is-on': isOn(r) }" @click.stop="tap(r)" @longpress.stop="hold(r)">
              <text class="tick-t">{{ tickLabel(r) }}</text>
            </view>
            <!-- 长按没有任何视觉提示，多次型的按钮下面常驻这行小字
                 （和宇定的方案：要「一直看得见」，不是「弹一次就不见了」）。
                 单次型不显示 —— 它的撤销就是再点一下，本来就知道。 -->
            <text v-if="multi(r)" class="tick-hint">长按撤销</text>
          </view>
        </slot>
      </template>
    </TreeRow>
  </view>
</template>

<script setup>
/* 一列树行。把「行与数据层之间那几个动作」也一并收进来：
   折叠、就地加子项、打卡、删除 —— 这几件在今日页和领域页是**逐字相同**的，
   留在各自的页面里就是同一段代码写两遍
   （今日页和领域页原本各有 6 个同名同体的函数：pathPre / edit / armAdd /
     commitSub / editGoal / del / tick）。

   父组件只需要给三样：
     ① rows —— 数据层已经展平好的行数组
     ② 正文插槽（三类行的名称与说明长得不一样）
     ③ 一个 @open 事件 —— 点开哪一行要开哪种弹窗，只有页面知道

   行尾插槽可以不填：`tickable` 为真时默认给打卡按钮（习惯行）。
   计划行要进度条就自己填 tail。 */
import { ref } from 'vue'
import { toggleFold, addSub, labelOf, saveState, delArmed, bumpHabitLog } from '../stores/db'
import { confirmDelete, toast } from '../lib/ui'
import TreeRow from './TreeRow.vue'

defineProps({
  rows: { type: Array, default: () => [] },
  /* 行左缘象限色条：传一个函数（今日页的待办按象限给色，已完成那栏给空）。
     给函数而不是值 —— 「这条该不该有色条」是行自己的事。 */
  bar: { type: Function, default: null },
  /* 就地加子项那个输入框的提示语。可以传字符串，也可以传一个 (row) => string ——
     计划行要按行带上父项的名字（「某某」的子项，拆成几步走）。 */
  addPh: { type: [String, Function], default: '子项内容，回车建好' },
  /* 习惯行：行尾给一个打卡按钮 */
  tickable: { type: Boolean, default: false }
})
defineEmits(['open'])

/* 哪一行的就地输入框开着。这是「此刻这一列的界面状态」，不进 db。
   而删除的武装态相反 —— 它必须全局唯一（同一时刻只能有一个待确认），
   所以直接用数据层那份 delArmed，自己不另持一份。 */
const subOn = ref('')
const armed = delArmed

function fold(r) {
  toggleFold(r.node.id)
  saveState()
}
function armAdd(spec) {
  subOn.value = subOn.value === spec ? '' : spec
}
function commitSub(spec, text) {
  if (subOn.value !== spec) return
  subOn.value = ''
  const t = String(text || '').trim()
  if (!t) return
  const r = addSub(spec, t)
  if (r.error) { toast(r.error); return }
  saveState(true)
  toast('已加上「' + t + '」')
}
/* ---- 打卡 ----
   多次型（「每周 4 次」「每天 3 次」—— FreqField 本来就能选出这种频率）
   按钮上直接是本期进度，点一下 +1，**长按撤销一次**。
   单次型保持老样子：点一下打卡，再点一下取消 —— 那本来就能用。 */

/* 长按之后浏览器还会照常派发 click：uni 的 longpress 是「touchstart + 350ms
   定时器」，手指抬起那一刻 click 照发 —— 不拦的话「长按撤销」会变成
   先 −1 再 +1，等于白按。记下长按的时刻，click 里发现刚长按过就跳过。
   用时间戳不用布尔标志：长按后手指滑出按钮再抬起时 click 不会来，
   布尔会残留到下一次点击把它误吞；时间戳自己过期，没有这个坑。 */
let lastLongAt = 0

function multi(r) { return r.target > 1 }
/* 按钮什么时候算「已完成」：多次型看本期进度够不够，单次型看今天打没打。
   两个口径不一样，但「变绿」对用户是同一个意思：这一项完成了。 */
function isOn(r) { return multi(r) ? r.periodCount >= r.target : !!r.doneToday }
function tickLabel(r) {
  return multi(r) ? r.periodCount + '/' + r.target : (r.doneToday ? '已打卡' : '打卡')
}
function tap(r) {
  if (Date.now() - lastLongAt < 700) return
  bumpHabitLog(r.node.id, 1)
  saveState()
  toast(multi(r)
    ? '记 1 次 · 本期 ' + (r.periodCount + 1) + '/' + r.target
    : '已打卡')
}
function hold(r) {
  lastLongAt = Date.now()
  if (!r.todayCount) { toast('今天还没有打卡记录'); return }
  bumpHabitLog(r.node.id, -1)
  saveState()
  toast(multi(r)
    ? '已撤销 · 本期 ' + (r.periodCount - 1) + '/' + r.target
    : '已撤销今天的打卡')
}
function del(r) {
  const d = confirmDelete(r.spec)
  if (d.done) toast('已删除「' + labelOf(r.node) + '」')
  else if (d.msg) toast(d.msg)
}
</script>

<style scoped>
.tree { display: block; }

/* 打卡按钮的样式跟着按钮一起搬进来（scoped 样式不会跨组件生效）。
   今日页和领域页原先各有一份逐字相同的 .tick / .tick-t。 */
.tickbox {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: 8px;
}
.tick {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 6px 14px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  background: var(--card);
}
.tick-t { font-size: 13px; color: var(--sub); }
.tick.is-on { background: var(--ok-bg); border-color: var(--ok); }
.tick.is-on .tick-t { color: var(--ok); }
.tick:active { background: var(--bg); }
/* 长按说明。比页面上任何正文都小一号 —— 它不是说给每一次看的，
   是让人第一次就知道有这个手势。 */
.tick-hint { margin-top: 2px; font-size: 9px; color: var(--muted); }
</style>
