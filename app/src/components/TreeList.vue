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
          <view v-if="tickable" class="tick" :class="{ 'is-on': r.doneToday }" @click.stop="tick(r.node.id)">
            <text class="tick-t">{{ r.doneToday ? '已打卡' : '打卡' }}</text>
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
import { toggleFold, addSub, labelOf, saveState, delArmed, toggleHabitLog, TODAY } from '../stores/db'
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
function tick(id) {
  const on = toggleHabitLog(id, TODAY)
  saveState()
  toast(on ? '已打卡' : '已取消今天的打卡')
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
.tick {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 6px 14px;
  margin-left: 8px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  background: var(--card);
}
.tick-t { font-size: 13px; color: var(--sub); }
.tick.is-on { background: var(--ok-bg); border-color: var(--ok); }
.tick.is-on .tick-t { color: var(--ok); }
.tick:active { background: var(--bg); }
</style>
