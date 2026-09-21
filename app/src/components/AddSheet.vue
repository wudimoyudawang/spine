<template>
  <view v-if="ADD.on" class="modal">
    <view class="modal-mask" @click="cancel"></view>

    <view class="modal-box">
      <view class="modal-h">
        <text class="modal-t">{{ cfg.title }}</text>
        <text class="modal-note">{{ cfg.note }}</text>
      </view>

      <view class="field">
        <text class="field-k">{{ cfg.nameK }}</text>
        <input :maxlength="-1"
          v-model="name"
          class="inline-in"
          :focus="focused"
          :placeholder="cfg.namePh"
          confirm-type="done"
          @confirm="submit"
        />
      </view>

      <!-- 待办问的是**到期日**，习惯和目标问的是一句说明。
           同一个字段的位子，两种内容 —— 因为合并成一份存储之后，
           一条待办唯一能问的就是「哪天」，再问一句自由说明就又是两套事实。 -->
      <view v-if="isTodo" class="field">
        <text class="field-k">什么时候要办</text>
        <view class="chips">
          <view class="mchip" :class="{ 'is-on': when === 'today' }" @click="when = 'today'">
            <text class="mchip-t">今天</text>
          </view>
          <picker mode="date" :value="pickDate" @change="onDate">
            <view class="mchip" :class="{ 'is-on': when === 'date' }">
              <text class="mchip-t">{{ when === 'date' ? pickDate : '选一天' }}</text>
            </view>
          </picker>
          <view class="mchip" :class="{ 'is-on': when === 'none' }" @click="when = 'none'">
            <text class="mchip-t">没有日期</text>
          </view>
        </view>
      </view>

      <view v-else class="field">
        <text class="field-k">{{ metaK }}</text>
        <input :maxlength="-1" v-model="meta" class="inline-in" :placeholder="cfg.metaPh" confirm-type="done" @confirm="submit" />
      </view>

      <view class="field">
        <text class="field-k">放到哪个空间 <text class="field-k-b">{{ spaceName }}</text></text>
        <view class="chips">
          <view
            v-for="d in db.DOMAINS"
            :key="d.id"
            class="mchip"
            :class="{ 'is-on': ADD.space === d.id }"
            @click="pick(d.id)"
          >
            <text class="mchip-t">{{ d.name }}</text>
          </view>
        </view>
      </view>

      <!-- 挂在谁下面。只在从某一行的加号点进来时出现 ——
           父项已经定了，得让人看见定成了谁，不然子项会凭空冒出来。 -->
      <view v-if="ADD.parentName" class="field">
        <text class="field-k">挂在「{{ ADD.parentName }}」下面</text>
      </view>

      <view class="modal-f">
        <text class="modal-hint" :class="{ 'is-err': !!err }">{{ err || '确认后记到「今天记下的」里' }}</text>
        <view class="btn" @click="cancel"><text class="btn-t">取消</text></view>
        <view class="btn btn-main" @click="submit"><text class="btn-t">新增</text></view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  db, TODAY, ADD, ADD_KINDS, closeAdd, pickAddSpace, commitAdd, domainById, saveState
} from '../stores/db'

const name = ref('')
const meta = ref('')
const err = ref('')
const focused = ref(false)

/* 到期日：'today' | 'date' | 'none'。默认今天 —— 新增待办最常见的就是「今天做」。 */
const when = ref('today')
const pickDate = ref(TODAY)

const cfg = computed(function () { return ADD_KINDS[ADD.kind] || ADD_KINDS.todo })

const isTodo = computed(function () { return ADD.kind === 'todo' })

const metaK = computed(function () {
  return ADD.kind === 'habit' ? '频率，选填' : '说明，选填'
})

const spaceName = computed(function () {
  const d = domainById(ADD.space)
  return d ? d.name : '还没选'
})

/* 每次打开都从空开始。上一次没提交的字留在框里，
   会被人当成已经记下了 —— 弹窗里的东西只有「取消」和「确认」两种下场。 */
watch(() => ADD.on, function (v) {
  if (!v) return
  name.value = ''
  meta.value = ''
  err.value = ''
  when.value = 'today'
  pickDate.value = TODAY
  focused.value = false
  nextTick(function () { focused.value = true })
})

function onDate(e) {
  pickDate.value = e.detail.value
  when.value = 'date'
  err.value = ''
}

function pick(id) {
  pickAddSpace(id)
  err.value = ''
}

function cancel() {
  closeAdd()
}

/* 交给 commitAdd 的那个「第二个字段」：待办是到期日（或 'none'），
   习惯和目标是一句自由说明。同一个位子，两种内容 —— 分叉在数据层那一个函数里。 */
function secondField() {
  if (!isTodo.value) return meta.value
  if (when.value === 'none') return 'none'
  return when.value === 'date' ? pickDate.value : TODAY
}

function submit() {
  const t = name.value.trim()
  const r = commitAdd(t, secondField())
  if (r.error) { err.value = r.error; return }
  err.value = ''
  saveState(true)
  uni.showToast({ title: '已新增「' + t + '」', icon: 'none' })
}
</script>

<style scoped>
</style>
