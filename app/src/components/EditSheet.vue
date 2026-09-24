<template>
  <view v-if="ED.on" class="modal">
    <view class="modal-mask" @click="cancel"></view>

    <view class="modal-box">
      <view class="modal-h">
        <text class="modal-t">{{ ED.title }}</text>
        <text class="modal-note">{{ ED.where }}</text>
      </view>

      <view class="modal-body">
      <text v-if="ED.hint" class="modal-sub">{{ ED.hint }}</text>

      <!-- 一行流水：只有正文，没有字段。它是「发生过什么」的记录，不是可以改的东西。 -->
      <view v-if="ED.kind === 'log'" class="logtext"><text class="logtext-t">{{ ED.draft.label }}</text></view>

      <!-- 字段全从 editFields() 来。这一种条目有哪几个可改的字段，是数据层的事，
           组件只管按 type 画。 -->
      <view v-for="f in fields" :key="f.k" class="field">
        <text class="field-k">{{ f.label }}</text>

        <input :maxlength="-1"
          v-if="f.type === 'text'"
          v-model="ED.draft[f.k]"
          class="inline-in"
          :focus="f.k === firstKey"
          confirm-type="done"
          @confirm="submit"
        />

        <!-- 金额和数值记录用数字键盘。type 是 uni 的写法（digit = 带小数点那个），
             别换成 HTML 的 number —— 移动端上那个会带出一堆用不上的键。 -->
        <input :maxlength="-1"
          v-else-if="f.type === 'num'"
          v-model="ED.draft[f.k]"
          class="inline-in"
          type="digit"
          confirm-type="done"
          @confirm="submit"
        />

        <view v-else-if="f.type === 'date'" class="daterow">
          <picker mode="date" :value="ED.draft[f.k] || ''" @change="onDate(f.k, $event)">
            <view class="datebtn">
              <text class="datebtn-t">{{ ED.draft[f.k] || '没有日期' }}</text>
            </view>
          </picker>
          <!-- 能设回「没有日期」：合并存储之后，把一条清单安排上日期和把一条承诺
               退回清单，是同一个字段的两端。少这颗钮，加错了日期就退不回去。
               支出和记录不一样：它们本来就有发生的哪天，退成空等于凭空造一条没有时间的数据。 -->
          <view v-if="ED.draft[f.k] && f.clearable !== false" class="dateclear" @click="ED.draft[f.k] = ''">
            <text class="dateclear-t">清掉日期</text>
          </view>
        </view>

        <!-- 提醒时间。空 = 不提醒。**不用 <input type="time">**：各端渲染差得多，
             App 上那个框会小到点不准，和上面日期那条一个理由 —— 走 uni 的 picker
             弹系统的时间轮盘。 -->
        <view v-else-if="f.type === 'time'" class="daterow">
          <picker mode="time" :value="ED.draft[f.k] || '09:00'" @change="onDate(f.k, $event)">
            <view class="datebtn">
              <text class="datebtn-t">{{ ED.draft[f.k] || '不提醒' }}</text>
            </view>
          </picker>
          <view v-if="ED.draft[f.k]" class="dateclear" @click="ED.draft[f.k] = ''">
            <text class="dateclear-t">不提醒</text>
          </view>
        </view>

        <!-- 四象限：选择器**自己长成一个 2×2**，两个轴各占一边。
             一排平铺四个选项的话，得先读字才知道哪个挨着哪个；
             摆成矩阵就不用读 —— 形状本身就是说明。 -->
        <view v-else-if="f.type === 'quad'" class="quad">
          <view class="quad-r">
            <text class="quad-ax"></text>
            <text class="quad-ax quad-ax-c">紧急</text>
            <text class="quad-ax quad-ax-c">不紧急</text>
          </view>
          <view v-for="row in QUAD_ROWS" :key="row.n" class="quad-r">
            <text class="quad-ax">{{ row.n }}</text>
            <view
              v-for="q in row.qs"
              :key="q.k"
              class="qcell"
              :class="['q' + q.k, { 'is-on': ED.draft[f.k] === q.k }]"
              @click="ED.draft[f.k] = q.k"
            >
              <text class="qcell-t">{{ q.n }}</text>
            </view>
          </view>
        </view>

        <view v-else-if="f.type === 'chips'" class="chips">
          <view
            v-for="o in f.opts"
            :key="String(o[0])"
            class="mchip"
            :class="{ 'is-on': ED.draft[f.k] === o[0] }"
            @click="ED.draft[f.k] = o[0]"
          >
            <text class="mchip-t">{{ o[1] }}</text>
          </view>
        </view>

        <!-- 频率：内嵌的选择块（单位 × 次数），不弹窗。手填会填出「一周四次」
             「周4」这种各写各的，复盘里没法归到一起；选择块把写法收成一种。
             解析不了的老值（手填的「工作日」）不动它就不改写。 -->
        <FreqField v-else-if="f.type === 'freq'" :value="ED.draft[f.k] || ''" @change="ED.draft[f.k] = $event" />
      </view>

      </view>

      <view class="modal-f">
        <text class="modal-hint" :class="{ 'is-err': !!err }">{{ err || footHint }}</text>
        <view class="btn" @click="cancel"><text class="btn-t">取消</text></view>
        <view class="btn" :class="ED.kind === 'log' ? 'btn-danger' : 'btn-main'" @click="submit">
          <text class="btn-t">{{ ED.btn }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { db, ED, editFields, closeEdit, commitEdit, saveState, QUAD } from '../stores/db'
import FreqField from './FreqField.vue'
import { toast } from '../lib/ui'

const err = ref('')

const fields = computed(function () { return editFields() })

/* 2×2 的两行：重要 / 不重要。紧急和不紧急在表头那一行。
   从 QUAD 里取而不是再写一遍那四个名字 —— 两份名字早晚会不一致。 */
const QUAD_ROWS = [
  { n: '重要', qs: [QUAD[0], QUAD[1]] },
  { n: '不重要', qs: [QUAD[2], QUAD[3]] }
]

/* 只让第一个文本框带焦点。都给的话，光标会停在最后那个上，
   人打开弹窗第一眼要看的是最上面那条。 */
const firstKey = computed(function () {
  const f = fields.value.filter(function (x) { return x.type === 'text' || x.type === 'num' })[0]
  return f ? f.k : ''
})

/* 底部那句提示。一行流水没有「改动」可言 —— 按钮是移除，那句话就该说清移除只动这一行。 */
const footHint = computed(function () {
  return ED.kind === 'log' ? '只移除这一行，不动它记下的那条' : '改动会记到「今天记下的」里'
})

watch(() => ED.on, function (v) { if (v) err.value = '' })

function onDate(k, e) {
  ED.draft[k] = e.detail.value
}

function cancel() {
  closeEdit()
}

function submit() {
  const r = commitEdit()
  if (r.error) { err.value = r.error; return }
  err.value = ''
  if (r.removed) {
    saveState(true)
    toast('已从今天的流水里移除')
    return
  }
  if (!r.unchanged) {
    saveState(true)
    toast('已更新')
  }
}
</script>

<style scoped>
/* 标题下面那句补充说明：说这一条是从哪儿来的，或说这里改不了什么。 */
.modal-sub {
  display: block;
  margin-bottom: 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
}
/* 流水正文：只读，所以长得像被读的东西，不像能点的东西 —— 不给边框和底色。 */
.logtext {
  padding: 10px 0 2px;
}
.logtext-t { font-size: 14px; line-height: 1.6; color: var(--text); }

/* 日期不裸用 <input type="date">：各端渲染差得多，App 上那个框会小到点不准。
   走 uni 的 picker，弹系统那个日期轮盘。 */
.datebtn {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  background: var(--bg);
  border: 1px solid var(--line2);
  border-radius: 9px;
}
.datebtn-t { font-size: 16px; color: var(--text); }
.daterow {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.daterow picker { flex: 1 1 auto; min-width: 0; }
.dateclear {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  margin-left: 8px;
  padding: 0 12px;
  border: 1px solid var(--line2);
  border-radius: 15px;
}
.dateclear-t { font-size: 12px; color: var(--sub); }
.dateclear:active { background: var(--bg); }

/* ---- 四象限选择器 ----
   3 列：左边一列是「重要/不重要」，右边两格是紧急与否。
   第一行的两个空格是表头的「紧急 / 不紧急」，故意也占满格宽 ——
   它们要对准下面那两格，光靠上面一排小字很容易看串。 */
.quad { }
.quad-r {
  display: flex;
  flex-direction: row;
  align-items: stretch;
}
.quad-ax {
  flex: none;
  width: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 0;
  font-size: 11px;
  color: var(--muted);
}
.quad-ax-c { flex: 1 1 0; width: auto; }
.qcell {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  margin: 0 0 4px 4px;
  padding: 3px 4px;
  border-radius: 9px;
}
.qcell-t { font-size: 12px; color: var(--sub); }
/* 四格的底色由设置里的四象限配色给（--qN 与 --qN-bg），
   和四象限页那四张卡是同一份。
   在这里就上色的理由：颜色↔象限的对应关系是在「选」的那一刻学会的，
   等到四象限页才第一次见到颜色，人得回去再看一遍自己标的是什么。 */
.qcell.q1 { background: var(--q1-bg); }
.qcell.q2 { background: var(--q2-bg); }
.qcell.q3 { background: var(--q3-bg); }
.qcell.q4 { background: var(--q4-bg); }
.qcell.q1.is-on { background: var(--q1); }
.qcell.q2.is-on { background: var(--q2); }
.qcell.q3.is-on { background: var(--q3); }
.qcell.q4.is-on { background: var(--q4); }
.qcell.is-on .qcell-t { color: #fff; }
/* 点下去的反馈用透明度而不是换底色 —— 换底色会把上面那套对应关系冲掉 */
.qcell:active { opacity: .7; }
</style>
