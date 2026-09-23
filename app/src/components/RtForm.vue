<template>
  <view class="rform">
    <input :maxlength="-1" v-model="name" class="rin" placeholder="记录项名称，比如「模拟考试分数」" placeholder-class="rph" />

    <view class="rrow">
      <view class="segsm">
        <view class="segsm-b" :class="{ 'is-on': mode === 'text' }" @click="setMode('text')">
          <text class="segsm-t">纯文字</text>
        </view>
        <view class="segsm-b" :class="{ 'is-on': mode === 'number' }" @click="setMode('number')">
          <text class="segsm-t">数值</text>
        </view>
      </view>
      <input :maxlength="-1"
        v-if="mode === 'number'"
        v-model="unit"
        class="rin rin-unit"
        placeholder="单位 kg"
        placeholder-class="rph"
      />
    </view>

    <view class="rsw">
      <view class="sw" :class="{ 'is-on': quick }" @click="quick = !quick"><view class="sw-dot"></view></view>
      <text class="rsw-t">出现在首页快记</text>
    </view>

    <view class="rbtns">
      <view class="rbtn rbtn-main" @click="save">
        <text class="rbtn-t rbtn-main-t">{{ isNew ? '创建' : '保存' }}</text>
      </view>
      <view class="rbtn" @click="$emit('cancel')"><text class="rbtn-t">取消</text></view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { toast } from '../lib/ui'

const props = defineProps({
  /* null = 新增；传记录项进来就用它填表 */
  rt: { type: Object, default: null },
  domain: { type: String, default: '' }
})
const emit = defineEmits(['save', 'cancel'])

const isNew = computed(function () { return !props.rt })
const name = ref('')
const mode = ref('text')
const unit = ref('')
const quick = ref(true)

watch(function () { return props.rt }, function (r) {
  name.value = r ? (r.name || '') : ''
  mode.value = r && r.mode === 'number' ? 'number' : 'text'
  unit.value = r ? (r.unit || '') : ''
  quick.value = r ? r.quick !== false : true
}, { immediate: true })

function setMode(m) {
  if (mode.value === m) return
  /* 两种方式记的不是同一种东西：换过去还留着旧内容，等于存进一个没人看得懂的值 */
  mode.value = m
  if (m === 'text') unit.value = ''
}

function save() {
  const n = name.value.trim()
  if (!n) { toast('先起个名字'); return }
  if (mode.value === 'number' && !unit.value.trim()) {
    toast('数值型写个单位，没有就换纯文字')
    return
  }
  emit('save', {
    id: isNew.value ? '' : props.rt.id,
    domain: props.domain || (props.rt && props.rt.domain),
    name: n,
    mode: mode.value,
    unit: unit.value.trim(),
    quick: quick.value
  })
}
</script>

<style scoped>
.rform {
  margin-top: 8px;
  padding: 10px;
  background: var(--bg);
  border-radius: 10px;
}
.rin {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text);
  box-sizing: border-box;
}
.rph { color: var(--muted); }

.rrow {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 8px;
}
.rin-unit {
  flex: 1 1 auto;
  min-width: 0;
  margin-left: 8px;
}
.segsm {
  flex: 0 0 auto;
  display: flex;
  flex-direction: row;
  padding: 2px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.segsm-b {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  height: 30px;
  border-radius: 6px;
}
.segsm-t { font-size: 12px; color: var(--sub); }
.segsm-b.is-on { background: var(--accent); }
.segsm-b.is-on .segsm-t { color: #fff; }

.rsw {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 10px;
}
.rsw-t { margin-left: 9px; font-size: 12px; color: var(--sub); }
.sw {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 10px;
  background: var(--line2);
}
.sw.is-on { background: var(--accent); }
.sw-dot {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
}
.sw.is-on .sw-dot { left: 17px; }

.rbtns { display: flex; flex-direction: row; margin-top: 10px; }
.rbtn {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  background: var(--card);
}
.rbtn-main { margin-right: 8px; background: var(--accent); border-color: var(--accent); }
.rbtn-t { font-size: 13px; color: var(--text); }
.rbtn-main-t { color: #fff; }
.rbtn:active { background: var(--bg); }
.rbtn-main:active { background: #2A63D2; }
</style>
