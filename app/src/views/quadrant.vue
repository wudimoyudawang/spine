<template>
  <view class="page">
    <PageHead title="四象限" :sub="headSub" />
    <ViewSeg />

    <view v-if="!total" class="empty">
      <text class="empty-t">还没有没做完的待办</text>
      <text class="empty-t">在「今日」页加一条，它就会出现在这里</text>
    </view>

    <view v-else class="grid2">
      <view v-for="q in QUAD" :key="q.k" class="qcard" :class="'q' + q.k">
        <view class="qc-h">
          <text class="qc-n">{{ q.n }}</text>
          <text class="qc-c">{{ rows[q.k].length }}</text>
        </view>
        <text class="qc-a">{{ q.act }}</text>

        <view v-if="!rows[q.k].length" class="qc-e">
          <text class="qc-e-t">空着</text>
        </view>
        <view v-for="r in rows[q.k]" :key="r.node.id" class="qrow" @click="edit(r.spec)">
          <DoneBox :on="false" @toggle="toggleDone(r.node)" />
          <view class="qrow-main">
            <text class="qrow-t">{{ r.node.title }}</text>
            <text class="qrow-m">{{ pathPre(r) }}{{ domainName(r.node) }}{{ dueNote(r) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 「一条都没标过」和「都标成不重要不紧急了」在界面上长得一模一样，
         但前者是没开始、后者是判断结果。分不出来的时候人会以为功能坏了，
         所以只在**一格都没标**的时候多说一句 —— 标过一格它自己就消失。 -->
    <view v-if="untouched" class="hint">
      <text class="hint-t">还一条都没标过 —— 点任意一条，在弹窗里给它选一格。</text>
    </view>

    <view class="foot">
      <text class="foot-t">这一页只看没做完的，跨领域、不限日期 —— 只看今天的话每格顶多一两件，</text>
      <text class="foot-t">排不出「重要不紧急」和「紧急不重要」的比例，那这四个格子就白摆了。</text>
      <text class="foot-t">点任意一条就能改它的四象限。</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { TODAY, QUAD, quadRows, domainName, saveState, openEdit, rollRepeat } from '../stores/db'
import PageHead from '../components/PageHead.vue'
import ViewSeg from '../components/ViewSeg.vue'
import DoneBox from '../components/DoneBox.vue'
import { toast } from '../lib/ui'

const rows = computed(function () { return quadRows() })

const total = computed(function () {
  const g = rows.value
  return g['1'].length + g['2'].length + g['3'].length + g['4'].length
})

/* 前三格一条都没有 = 还没开始标。第 4 格有东西不算数：那正是「没标」落的地方。 */
const untouched = computed(function () {
  const g = rows.value
  return total.value > 0 && !g['1'].length && !g['2'].length && !g['3'].length
})

/* 副标题给「紧急的那两格加起来多少」—— 那是这一页真正想让人看见的数：
   紧急且重要是要马上处理的，紧急不重要是该甩掉的，两个都压在今天。 */
const headSub = computed(function () {
  const g = rows.value
  const urgent = g['1'].length + g['3'].length
  return '全部 ' + total.value + ' 条没做完 · 其中紧急 ' + urgent + ' 条'
})

function pathPre(r) { return r.path ? r.path + ' · ' : '' }

/* 到期日在这一页是有意义的信息（虽然不分组）：它决定同一格里谁排前面，
   写出来才知道为什么这条在上面。没有日期的直说是清单上的一条。 */
function dueNote(r) {
  const d = r.node.due
  if (!d) return ' · 没有日期'
  if (d < TODAY) return ' · 逾期 ' + d.slice(5) + ' 起'
  if (d === TODAY) return ' · 今天到期'
  return ' · ' + d.slice(5) + ' 到期'
}

function edit(spec) {
  const r = openEdit(spec)
  if (r && r.error) toast(r.error)
}

/* 勾上就直接离开这一页 —— 它不再是「没做完的」，四个格子里都不该有它。
   这不是动画效果，是这一页的口径就是这样：完成 = 从这里消失。
   （今日页不一样，那边完成的留在「已完成」里，因为要能反悔。这里要反悔就切回今日。） */
function toggleDone(it) {
  it.status = 'done'
  rollRepeat(it)
  saveState()
  toast('完成了，已从这里移走')
}
</script>

<style scoped>

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  align-items: start;
}

/* 四格各铺一层自己的底色。
   原来只有左边一条 3px 的竖线是彩的，四张白卡扫一眼分不出哪边是什么 ——
   颜色在这里不是装饰，是这一页唯一的「哪边是什么」的线索。
   底色用的是设计变量里的那几个浅色（--danger-bg / --accent-bg / --warn-bg），
   和应用里其它「警示/强调」的底色是同一套，不会长出第五种气质。
   第 4 格（都不）刻意不给彩色：它就是「没标过 / 不用管」的那格，
   给彩色等于告诉人这一格也值得看。 */
.qcard {
  padding: 9px 10px 6px;
  background: var(--card);
  border: 1px solid var(--line);
  border-left: 3px solid var(--line2);
  border-radius: var(--r);
}
.qcard.q1 { border-left-color: var(--q1); background: var(--q1-bg); }
.qcard.q2 { border-left-color: var(--q2); background: var(--q2-bg); }
.qcard.q3 { border-left-color: var(--q3); background: var(--q3-bg); }
.qcard.q4 { border-left-color: var(--q4); background: var(--q4-bg); }

.qc-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
}
.qc-n { font-size: 13px; font-weight: 500; color: var(--text); }
/* 条数做成实心小胶囊，底色跟格子走。数字在彩底上比彩色数字清楚 ——
   尤其橙和红这两种，做成字容易和标题混在一起。 */
.qc-c {
  flex: none;
  margin-left: 6px;
  min-width: 20px;
  padding: 0 7px;
  border-radius: 9px;
  text-align: center;
  font-size: 11px;
  line-height: 1.5;
  color: #fff;
  background: var(--muted);
}
.qcard.q1 .qc-c { background: var(--q1); }
.qcard.q2 .qc-c { background: var(--q2); }
.qcard.q3 .qc-c { background: var(--q3); }
.qcard.q4 .qc-c { background: var(--q4); }
.qc-a {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--muted);
}
.qcard.q1 .qc-a { color: var(--q1); }
.qcard.q2 .qc-a { color: var(--q2); }
.qcard.q3 .qc-a { color: var(--q3); }

.qc-e { padding: 8px 0 10px; }
.qc-e-t { font-size: 12px; color: var(--muted); }

.qrow {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 5px 0 5px 0;
  border-top: 1px solid var(--line);
}
/* 点下去的反馈用「变白」而不是「变灰」：卡片底色已经是彩的了，
   再变灰会和底色打架，变白在四种底色上都看得出来。 */
.qrow:active { background: var(--card); }
/* 半宽卡片里每一条都窄，勾选框不用 32px 那么大的点按区 ——
   再大会把标题挤掉一半。18px 在触屏上仍然够点。 */
.qrow :deep(.cbox) { width: 24px; height: 24px; margin-right: 0; }
/* !maxlength 那类问题跟这里无关；这一条是让长标题换行而不是撑破卡片 */
.qrow-main { flex: 1 1 auto; min-width: 0; padding: 2px 0; }
.qrow-t {
  display: block;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text);
  overflow-wrap: break-word;
}
.qrow-m {
  display: block;
  margin-top: 1px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--muted);
  overflow-wrap: break-word;
}

.hint {
  margin-bottom: 8px;
  padding: 9px 12px;
  background: var(--accent-bg);
  border-radius: var(--r);
}
.hint-t { display: block; font-size: 12px; line-height: 1.6; color: var(--accent); }

.foot { padding: 4px 2px 0; }
.foot-t { display: block; font-size: 11px; line-height: 1.7; color: var(--muted); }

.empty { padding: 20px 0; }
.empty-t { display: block; font-size: 13px; color: var(--muted); }
</style>
