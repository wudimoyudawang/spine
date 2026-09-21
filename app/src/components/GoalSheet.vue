<template>
  <view v-if="GOAL.on" class="modal">
    <view class="modal-mask" @click="cancel"></view>

    <view class="modal-box">
      <view class="modal-h">
        <text class="modal-t">{{ GOAL.title }}</text>
        <text class="modal-note">{{ spaceName }}</text>
      </view>

      <view class="field">
        <text class="field-k">目标名称（必填）</text>
        <input v-model="GOAL.draft.t" class="inline-in" :focus="focused" placeholder="比如「读完《置身事内》」" />
      </view>

      <view class="field">
        <text class="field-k">说明，选填</text>
        <input v-model="GOAL.draft.m" class="inline-in" placeholder="比如「每周 30 页 · 已读 210/350 页」" />
      </view>

      <!-- 进度在弹窗里改的是草稿：拖过头了点取消就行，不用回去把杠挪回原位 -->
      <view class="field">
        <text class="field-k">当前进度</text>
        <view class="goal-prog">
          <slider
            class="gbar"
            :value="GOAL.draft.p"
            min="0"
            max="100"
            step="1"
            :block-size="18"
            activeColor="#2F6FEB"
            backgroundColor="#E6E8EE"
            @changing="onSlide"
            @change="onSlide"
          />
          <text class="goal-val">{{ GOAL.draft.p }}%</text>
          <view class="goal-btns">
            <view v-for="s in GOAL_STEPS" :key="s" class="gbtn" @click="bump(s)">
              <text class="gbtn-t">+{{ s }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="GOAL.parentName" class="field">
        <text class="field-k">挂在「{{ GOAL.parentName }}」下面</text>
      </view>

      <view class="modal-f">
        <text class="modal-hint" :class="{ 'is-err': !!err }">{{ err || hint }}</text>
        <view class="btn" @click="cancel"><text class="btn-t">取消</text></view>
        <view class="btn btn-main" @click="submit"><text class="btn-t">确认</text></view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  GOAL, GOAL_STEPS, closeGoal, commitGoal, setGoalP, progressOf,
  GOAL_DRAFT_ID, domainById, saveState
} from '../stores/db'

const err = ref('')
const focused = ref(false)

const spaceName = computed(function () {
  const d = domainById(GOAL.domainId)
  return d ? d.name : ''
})

const hint = computed(function () {
  return GOAL.mode === 'edit' ? '改动会记到「今天记下的」里' : '确认后记到「今天记下的」里'
})

watch(() => GOAL.on, function (v) {
  if (!v) return
  err.value = ''
  focused.value = false
  nextTick(function () { focused.value = true })
})

/* 滑杆写进的是草稿那一份进度，用同一个 setGoalP：
   草稿和真实条目走同一条写入路径，就不会出现「弹窗里改了外面没改」。 */
function onSlide(e) {
  setGoalP(GOAL_DRAFT_ID, e.detail.value, 'slider')
}

function bump(s) {
  setGoalP(GOAL_DRAFT_ID, progressOf(GOAL_DRAFT_ID) + s, 'button')
}

function cancel() {
  closeGoal()
}

function submit() {
  const t = String(GOAL.draft.t || '').trim()
  const r = commitGoal()
  if (r.error) { err.value = r.error; return }
  err.value = ''
  if (r.unchanged) return
  saveState(true)
  uni.showToast({ title: r.created ? '已新增「' + t + '」' : '已更新「' + t + '」', icon: 'none' })
}
</script>

<style scoped>
/* 弹窗里滑杆要占满那一行剩下的地方，不然三个钮会把它挤成一小截 */
.goal-prog { padding: 4px 0; }
</style>
