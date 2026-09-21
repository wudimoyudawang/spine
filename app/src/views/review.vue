<template>
  <view class="page">
    <view class="pagehead"><text class="ph-t">复盘</text></view>

    <view class="seg">
      <view
        v-for="m in MODES"
        :key="m.k"
        class="seg-b"
        :class="{ 'is-on': mode === m.k }"
        @click="pickMode(m.k)"
      >
        <text class="seg-t">{{ m.n }}</text>
      </view>
    </view>

    <!-- 自定义区间：两个日子各自点一下弹系统日期轮盘。
         不裸用 <input type="date">，和新增待办那条路同一个理由。 -->
    <view v-if="mode === 'custom'" class="range">
      <picker mode="date" :value="from" :end="to" @change="onFrom">
        <view class="mchip"><text class="mchip-t">{{ fmtCN(from) }}</text></view>
      </picker>
      <text class="range-k">到</text>
      <picker mode="date" :value="to" :start="from" @change="onTo">
        <view class="mchip"><text class="mchip-t">{{ fmtCN(to) }}</text></view>
      </picker>
    </view>

    <view class="revbar">
      <text class="revbar-t">这一期：{{ rangeText }}　共 {{ d.days }} 天</text>
      <text class="revbar-t">上一期：{{ prevText }}</text>
    </view>

    <view class="grid3">
      <view class="card">
        <text class="stat-v">{{ d.todos.total ? (d.todos.done + ' / ' + d.todos.total) : '—' }}</text>
        <text class="stat-s">待办完成</text>
      </view>
      <view class="card">
        <text class="stat-v">{{ d.habit }} / {{ d.days }}</text>
        <text class="stat-s">有打卡的天数</text>
      </view>
      <view class="card">
        <text class="stat-v">{{ d.captures }}</text>
        <text class="stat-s">记了几笔</text>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">数值趋势</text>
        <text class="block-note">和上一期比</text>
      </view>
      <view v-if="!rows.length" class="empty">
        <text class="empty-t">这一期什么都没在看。</text>
        <text class="empty-t">点下面「添加一项」，比如体重、热量摄入。</text>
      </view>
      <view v-for="r in rows" :key="r.key" class="trend-row">
        <text class="trend-k">{{ r.def.name }}</text>
        <text class="trend-v">{{ metricLine(r.def, d) }}</text>
        <view class="mini" :class="{ 'mini-del': true, 'is-armed': armed === 'trend:' + r.key }" @click="delRow(r)">
          <text class="mini-t">{{ armed === 'trend:' + r.key ? '确认删' : '删' }}</text>
        </view>
      </view>
      <view class="addwide" @click="pickOn = !pickOn">
        <PlusIcon v-if="!pickOn" :size="14" />
        <text class="addwide-t">{{ pickOn ? '收起' : '添加一项' }}</text>
      </view>
      <view v-if="pickOn" class="chips chips-pick">
        <view v-for="c in cands" :key="metricKey(c)" class="mchip" @click="addRow(c)">
          <text class="mchip-t">{{ c.name }}{{ c.unit ? ('（' + c.unit + '）') : '' }}</text>
        </view>
        <text v-if="!cands.length" class="trend-v">能加的都已经加上了</text>
      </view>
      <view class="note">
        <text class="note-t">删掉一项只是不再单独看它。</text>
        <text class="note-t">数据一条没动，随时能加回来。</text>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">习惯打卡</text>
        <text class="block-note">连续 / 累计 · 这一期</text>
      </view>
      <view v-for="r in habitRows" :key="r.node.id" class="rev-h">
        <text class="rev-hk" :style="r.depth ? { paddingLeft: (r.depth * 14) + 'px' } : null">{{ r.node.t }}</text>
        <text class="rev-hs">{{ r.streak ? r.streak.s : '还没有打卡记录' }}</text>
        <text class="rev-hx" :class="{ 'is-quiet': !r.days }">这一期 {{ r.days }} 天</text>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">这一期记下的事</text>
        <text class="block-note">文字型的记录项</text>
      </view>
      <view v-if="!d.texts.length" class="empty">
        <text class="empty-t">这一期没有文字型记录。</text>
        <text class="empty-t">去领域页的记录项里记一条，复盘才有得看。</text>
      </view>
      <view v-for="(x, i) in d.texts" :key="x.d + '-' + x.name + '-' + i" class="noteitem">
        <text class="noteitem-d">{{ fmtCN(x.d) }} · {{ x.name }}</text>
        <text class="noteitem-c">{{ x.v }}</text>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">下一步</text>
        <text class="block-note">结论可以变成待办</text>
      </view>
      <input
        v-model="conclusion"
        class="inline-in"
        placeholder="这一期想留下的一句话"
        confirm-type="done"
        @confirm="toItem"
      />
      <view class="chips">
        <view class="btn btn-main" @click="toItem"><text class="btn-t btn-main-t">写成新事项</text></view>
        <view class="btn" @click="exportText"><text class="btn-t">导出这一期</text></view>
      </view>
      <view v-if="out" class="rev-out"><text class="rev-out-t">{{ out }}</text></view>
      <view class="note">
        <text class="note-t">复盘最容易漏的一步，是把结论写成待办。随心记不进复盘。</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  db, TODAY, fmtCN, habitDaysInRange, addTodo,
  armDelete, delArmed, saveState,
  reviewRange, prevRange, rangeLabel, setRevMode, setRevEnd,
  reviewData, metricLine, metricKey, trendRows, trendCandidates, addTrend,
  habitTree, streakText
} from '../stores/db'
import PlusIcon from '../components/PlusIcon.vue'

const MODES = [{ k: 'week', n: '本周' }, { k: 'month', n: '本月' }, { k: 'custom', n: '自定义' }]

const conclusion = ref('')
const out = ref('')
const pickOn = ref(false)
const armed = delArmed

const mode = computed(function () { return db.REV_MODE })
const range = computed(function () { return reviewRange() })
const from = computed(function () { return range.value.from })
const to = computed(function () { return range.value.to })
const rangeText = computed(function () { return rangeLabel(range.value) })
const prevText = computed(function () { return rangeLabel(prevRange(range.value)) })

/* 整页的数字一次算完。每个数字只在这里算一遍，界面上只是摆出来 ——
   散在模板里各算各的，两处「这一期」迟早对不上。 */
const d = computed(function () { return reviewData() })
const rows = computed(function () { return trendRows() })
const cands = computed(function () { return trendCandidates() })

const habitRows = computed(function () {
  const r = range.value
  return habitTree().map(function (x) {
    return {
      node: x.node, depth: x.depth,
      streak: streakText(x.node.id, TODAY),
      days: habitDaysInRange(x.node.id, r.from, r.to)
    }
  })
})

function pickMode(m) { setRevMode(m); touch() }
function onFrom(e) { setRevEnd('from', e.detail.value); touch() }
function onTo(e) { setRevEnd('to', e.detail.value); touch() }

function addRow(c) {
  if (!addTrend(metricKey(c))) { uni.showToast({ title: '这一项已经在了', icon: 'none' }); return }
  touch()
  uni.showToast({ title: '已加进这一期的趋势', icon: 'none' })
}

function delRow(r) {
  const res = armDelete('trend:' + r.key)
  if (!res) return
  if (res.error) { uni.showToast({ title: res.error, icon: 'none' }); return }
  touch()
  uni.showToast({ title: '已去掉「' + res.label + '」', icon: 'none' })
}

function touch() { saveState(true) }

function toItem() {
  const t = conclusion.value.trim()
  if (!t) { uni.showToast({ title: '先写一句结论', icon: 'none' }); return }
  addTodo(t, '')
  conclusion.value = ''
  uni.showToast({ title: '已写成今天的待办', icon: 'none' })
}

/* 导出跟着屏幕上那份清单走：这里没在看的项目，不必出现在文本里。 */
function revText() {
  const dd = d.value
  const L = []
  L.push('复盘 · ' + rangeLabel(dd.range) + '（' + dd.days + ' 天）')
  L.push('上一期：' + rangeLabel(dd.prev))
  L.push('')
  L.push('待办完成：' + (dd.todos.total ? (dd.todos.done + ' / ' + dd.todos.total) : '这一期没有到期的待办'))
  L.push('习惯打卡：' + dd.habit + ' / ' + dd.days + ' 天')
  L.push('记了 ' + dd.captures + ' 笔')
  L.push('')
  /* 一次都没打过卡的习惯不写进文本 —— 导出的是一份能看的复述，不是数据转储 */
  for (const r of habitRows.value) {
    if (!r.streak) continue
    L.push('· ' + r.node.t + '：' + r.streak.s + '（这一期 ' + r.days + ' 天）')
  }
  L.push('')
  for (const row of rows.value) L.push(row.def.name + '：' + metricLine(row.def, dd))
  if (dd.texts.length) {
    L.push('')
    L.push('这一期记下的事：')
    for (const x of dd.texts) L.push('· ' + fmtCN(x.d) + ' ' + x.name + '：' + x.v)
  }
  const c = conclusion.value.trim()
  if (c) { L.push(''); L.push('结论：' + c) }
  return L.join('\n')
}

function exportText() {
  const text = revText()
  out.value = text
  /* 复制而不是下载文件：手机上「导出」最常用的去向就是把它贴到别处，
     而下载在 App 的 WebView 里还得单独接原生文件写入。 */
  uni.setClipboardData({
    data: text,
    success: function () { uni.showToast({ title: '已复制', icon: 'none' }) }
  })
}
</script>

<style scoped>
.page {
  padding: 14px 14px calc(76px + env(safe-area-inset-bottom));
}

.pagehead { padding: 4px 46px 12px 2px; }
.ph-t { font-size: 22px; font-weight: 500; color: var(--text); }

.seg {
  display: flex;
  flex-direction: row;
  padding: 3px;
  margin-bottom: 10px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.seg-b {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border-radius: 8px;
}
.seg-b.is-on { background: var(--accent); }
.seg-t { font-size: 13px; color: var(--sub); }
.seg-b.is-on .seg-t { color: #fff; }

.range {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 8px;
}
.range-k { margin: 0 8px; font-size: 12px; color: var(--muted); }

.revbar { padding: 0 2px 12px; }
.revbar-t { display: block; font-size: 12px; color: var(--muted); line-height: 1.6; }

.grid3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;
}
.card {
  padding: 10px 8px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
  text-align: center;
}
.stat-v { display: block; font-size: 18px; font-weight: 500; color: var(--text); line-height: 1.3; }
.stat-s { display: block; margin-top: 2px; font-size: 11px; color: var(--muted); }

.block {
  margin-bottom: 14px;
  padding: 10px 14px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.block-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 8px;
}
.tag { font-size: 14px; font-weight: 500; color: var(--text); }
.block-note { font-size: 12px; color: var(--muted); }

.trend-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.trend-k { flex: 0 0 auto; margin-right: 8px; font-size: 14px; color: var(--text); }
.trend-v { flex: 1 1 auto; min-width: 0; font-size: 12px; color: var(--sub); }

.rev-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  flex-wrap: wrap;
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.rev-hk { flex: 1 1 auto; min-width: 0; font-size: 14px; color: var(--text); }
.rev-hs { font-size: 12px; color: var(--muted); }
.rev-hx { width: 100%; margin-top: 2px; font-size: 12px; color: var(--accent); }
/* 零天不该长得像亮点。蓝色只留给「这一期真打过卡」的那些行。 */
.rev-hx.is-quiet { color: var(--muted); }

.noteitem { padding: 9px 0; border-top: 1px solid var(--line); }
.noteitem-d { display: block; font-size: 12px; color: var(--muted); }
.noteitem-c { display: block; margin-top: 2px; font-size: 14px; color: var(--text); }

.inline-in {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.chips { display: flex; flex-direction: row; align-items: center; flex-wrap: wrap; margin-top: 10px; }
.chips-pick { margin-top: 8px; }
.mchip {
  display: flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  margin: 4px 8px 0 0;
  border: 1px solid var(--line2);
  border-radius: 15px;
}
.mchip-t { font-size: 12px; color: var(--text); }
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  margin-right: 10px;
  border: 1px solid var(--line2);
  border-radius: 10px;
}
.btn-t { font-size: 13px; color: var(--text); }
.btn-main { background: var(--accent); border-color: var(--accent); }
.btn-main-t { color: #fff; }
.btn:active { background: var(--bg); }

.addwide {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  margin-top: 10px;
  border: 1px dashed var(--line2);
  border-radius: 10px;
}
.addwide :deep(.pi) { margin-right: 5px; }
.addwide-t { font-size: 13px; color: var(--sub); }
.mini {
  display: flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  margin-left: 8px;
  border: 1px solid var(--line2);
  border-radius: 13px;
}
.mini-t { font-size: 12px; color: var(--text); }
.mini-del.is-armed { background: var(--danger-bg); border-color: var(--danger); }

/* 导出的文本要能一眼看清，所以用可换行的等宽排法 */
.rev-out {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: 10px;
}
.rev-out-t {
  font-size: 12px;
  line-height: 1.7;
  color: var(--sub);
  white-space: pre-wrap;
}

.note { padding-top: 12px; }
.note-t { display: block; font-size: 12px; line-height: 1.5; color: var(--muted); }

.empty { padding: 10px 0 4px; }
.empty-t { display: block; font-size: 13px; line-height: 1.5; color: var(--muted); }
</style>
