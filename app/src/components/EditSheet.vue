<template>
  <view v-if="ED.on" class="modal">
    <view class="modal-mask" @click="cancel"></view>

    <view class="modal-box">
      <view class="modal-h">
        <text class="modal-t">{{ ED.title }}</text>
        <text class="modal-note">{{ ED.where }}</text>
      </view>

      <!-- 字段全从 editFields() 来。这一种条目有哪几个可改的字段，是数据层的事，
           组件只管按 type 画。 -->
      <view v-for="f in fields" :key="f.k" class="field">
        <text class="field-k">{{ f.label }}</text>

        <input
          v-if="f.type === 'text'"
          v-model="ED.draft[f.k]"
          class="inline-in"
          :focus="f.k === firstKey"
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
               退回清单，是同一个字段的两端。少这颗钮，加错了日期就退不回去。 -->
          <view v-if="ED.draft[f.k]" class="dateclear" @click="ED.draft[f.k] = ''">
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
        <text class="modal-hint" :class="{ 'is-err': !!err }">{{ err || '改动会记到「今天记下的」里' }}</text>
        <view class="btn" @click="cancel"><text class="btn-t">取消</text></view>
        <view class="btn btn-main" @click="submit"><text class="btn-t">保存</text></view>
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
  const f = fields.value.filter(function (x) { return x.type === 'text' })[0]
  return f ? f.k : ''
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
  if (!r.unchanged) {
    saveState(true)
    uni.showToast({ title: '已更新', icon: 'none' })
  }
}
</script>

<style scoped>
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
