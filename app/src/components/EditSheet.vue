<template>
  <view v-if="ED.on" class="modal">
    <view class="modal-mask" @click="cancel"></view>

    <view class="modal-box">
      <view class="modal-h">
        <text class="modal-t">{{ ED.title }}</text>
        <text class="modal-note">{{ ED.where }}</text>
      </view>

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
import { db, ED, editFields, closeEdit, commitEdit, saveState } from '../stores/db'

const err = ref('')

const fields = computed(function () { return editFields() })

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
    uni.showToast({ title: '已从今天的流水里移除', icon: 'none' })
    return
  }
  if (!r.unchanged) {
    saveState(true)
    uni.showToast({ title: '已更新', icon: 'none' })
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
</style>
