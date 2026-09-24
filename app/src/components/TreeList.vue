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
      <!-- 行尾：默认给习惯行的打卡按钮；计划行要用进度条就自己填这个插槽。
           方案 D（宇 2026-09-24 挑的）：30px 圆钮，完成色可在设置页换（db.TICK_DONE），
           描边、进度环、完成态的底是同一个色 —— 一个偏好管住整颗按钮。
             多次型 = **永远**进度环 + 数字（达标了也是满环，不换成勾）；
             单次已打卡 = 实心完成色圆 + 白勾；
             单次未打卡 = 空圈 + 空心勾（点下去这个勾就变成实心的）。 -->
      <template #tail>
        <slot name="tail" :row="r">
          <view
            v-if="tickable"
            class="tickc"
            :class="tickClass(r)"
            :style="tickStyle(r)"
            @click.stop="tap(r)"
            @longpress.stop="hold(r)"
          >
            <!-- 多次型：SVG 圆环画进度（矢量，粗细均匀 —— conic-gradient 加白圆
                 那版在满环时边缘渗色，看起来环宽不匀，换掉了）。 -->
            <template v-if="multi(r)">
              <svg class="tick-ring" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="14.5" fill="none" stroke="#E6E8EE" stroke-width="1.5" />
                <circle
                  cx="16" cy="16" r="14.5" fill="none"
                  :stroke="doneColor()" stroke-width="1.5" stroke-linecap="round"
                  :stroke-dasharray="ringDash(r)" transform="rotate(-90 16 16)"
                />
              </svg>
              <view class="tick-num">{{ r.periodCount + '/' + r.target }}</view>
            </template>
            <svg
              v-else-if="isOn(r)"
              class="tick-svg"
              width="12" height="12" viewBox="0 0 16 16"
              fill="none" stroke="#fff" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round"
            >
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
            <svg
              v-else
              class="tick-svg"
              width="13" height="13" viewBox="0 0 16 16"
              fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round"
            >
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
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
import { db, TODAY, toggleFold, addSub, labelOf, saveState, delArmed, bumpHabitLog, habitCountOn } from '../stores/db'
import { confirmDelete, toast } from '../lib/ui'
import { syncReminders } from '../lib/notify'
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
   单次型：点一下打卡；撤销用长按（toast 里会说），也可以再点一下。
   方案 D（宇 2026-09-24 挑的）：38px 圆钮 ——
     单次未打卡 = 空圈 + 空心勾（点下去这个勾就变成实心的）；
     已打卡 / 多次达标 = 实心完成色圆 + 白勾；
     多次进行中 = 进度环（环长 = 本期完成比例）+ 环心数字。
   完成色在设置页选（db.TICK_DONE），描边、进度环、完成底是同一个色。 */

/* 长按之后浏览器还会照常派发 click：uni 的 longpress 是「touchstart + 350ms
   定时器」，手指抬起那一刻 click 照发 —— 不拦的话「长按撤销」会变成
   先 −1 再 +1，等于白按。记下长按的时刻，click 里发现刚长按过就跳过。
   用时间戳不用布尔标志：长按后手指滑出按钮再抬起时 click 不会来，
   布尔会残留到下一次点击把它误吞；时间戳自己过期，没有这个坑。
   **还必须记住是哪一行**：早先只存一个全局时间戳，等于「任何一行长按之后
   700ms 内，别的行的点击也一起被吞」。真机上窗口只有 700ms、很难撞到，
   但组件测试里时钟是冻的（Date.now() 不前进），于是长按过一行之后
   所有行的点击全部失效 —— 这条是组件测试当场抓出来的。
   要拦的就是「同一颗按钮紧跟的那一次 click」，按行判才对。 */
let lastLong = { id: '', at: 0 }

/* 完成色：设置页选的（db.TICK_DONE），没选就是内置绿。 */
const doneColor = () => db.TICK_DONE || '#0F7A5A'

function multi(r) { return r.target > 1 }
/* 按钮什么时候算「已完成」：多次型看本期进度够不够，单次型看今天打没打。
   两个口径不一样，但「变成完成色」对用户是同一个意思：这一项完成了。 */
function isOn(r) { return multi(r) ? r.periodCount >= r.target : !!r.doneToday }
function tickClass(r) {
  /* 多次型**永远**是进度环 —— 达标了也是满环 + 数字，不换成勾
     （宇 2026-09-24：8/4 这样的一直显示，不要变成 √）。 */
  if (multi(r)) return 'is-ring'
  return isOn(r) ? 'is-done' : 'is-idle'
}
/* 进度环的进度弧长：SVG dasharray，走多少铺多少，其余露出灰底环。 */
const RING_C = (2 * Math.PI * 14.5).toFixed(2)
function ringDash(r) {
  const pct = Math.max(0, Math.min(100, Math.round(100 * r.periodCount / r.target)))
  return (RING_C * pct / 100).toFixed(2) + ' ' + RING_C
}
/* 多次型只需要给环心数字上色；环的描边色在模板的 svg 属性上。 */
function tickStyle(r) {
  const c = doneColor()
  if (multi(r)) return { color: c }
  if (isOn(r)) return { background: c }
  return { borderColor: c, color: c }
}
function tap(r) {
  if (lastLong.id === r.node.id && Date.now() - lastLong.at < 700) return
  bumpHabitLog(r.node.id, 1)
  saveState()
  /* 打卡之后重排提醒：这个习惯如果设了提醒、今天这一颗已经不该再响，
     下一次回到前台/下次重排时会自动把今天那颗取消（见 notify 的全量替换）。
     这里即时调一次，不等人切走 —— 人是可能打完卡就把手机扣下的。 */
  syncReminders()
  /* 撤销的手势只在 toast 里说 —— 按钮下常驻小字试过一版，宇觉得丑；
     每次打卡都带一句，看过两次自然就知道了。 */
  toast(multi(r)
    ? '记 1 次 · 本期 ' + (r.periodCount + 1) + '/' + r.target + ' · 长按撤销'
    : '已打卡 · 长按撤销')
}
function hold(r) {
  lastLong = { id: r.node.id, at: Date.now() }
  /* 有没有打过卡要问**数据层**（habitCountOn 实时查），不能用行上的 todayCount ——
     那是快照：连续撤销时行对象还没重算，快照说 0 就会跳过一次真实的撤销。
     **今天这个日期必须显式传**：habitCountOn 的第二参省掉会退化成 count[undefined]，
     拿回来恒为 0，于是这里永远提示「今天还没有打卡记录」、一次都撤销不掉。
     （2026-09-24 修的：这个漏参从 b153b0c 引入长按撤销那天就在了，
       端到端里一直表现为「长按合成不稳定」，其实它一次都没成功过。） */
  if (!habitCountOn(r.node.id, TODAY)) { toast('今天还没有打卡记录'); return }
  bumpHabitLog(r.node.id, -1)
  saveState()
  syncReminders()
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

/* 打卡圆钮（方案 D）的样式跟着按钮一起搬进来（scoped 样式不会跨组件生效）。
   三个状态类的颜色都来自 tickStyle() 的内联样式（跟设置页选的完成色走），
   这里只管形状。 */
.tickc {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  margin-left: 6px;
  border-radius: 50%;
  box-sizing: border-box;
}
/* 未打卡：白底、完成色描边（色在 tickStyle 里），svg 勾用 currentColor */
.tickc.is-idle { border: 1px solid; background: var(--card); }
/* 已完成 / 达标：实心完成色圆 + 白勾 */
.tickc.is-done { border: none; }
/* 多次进行中：SVG 环铺满容器（灰底环 + 完成色进度弧），数字直接居中在环心里。
   粗细由 svg 的 stroke-width 给，均匀；数字色继承 .tickc 上的完成色。 */
.tickc.is-ring { position: relative; }
.tick-ring {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.tick-num {
  position: relative;
  font-size: 10px;
}
.tick-svg { display: block; }
</style>
