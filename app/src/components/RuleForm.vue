<template>
  <view class="rform">
    <input v-model="name" class="rin" placeholder="规则名，比如「咖啡 → 餐饮」" placeholder-class="rph" />

    <view class="rrow">
      <view class="segsm">
        <view class="segsm-b" :class="{ 'is-on': cond === 'kw' }" @click="setCond('kw')">
          <text class="segsm-t">关键词</text>
        </view>
        <view class="segsm-b" :class="{ 'is-on': cond === 're' }" @click="setCond('re')">
          <text class="segsm-t">正则</text>
        </view>
      </view>
      <!-- 目标只能从「现在有的那些」里挑，不给手填：
           填错一个 id 的规则不会报错，它只是永远不命中，谁都看不出为什么。 -->
      <picker class="rtgt" mode="selector" :range="opts" range-key="t" :value="picked" @change="onPick">
        <view class="rtgt-b">
          <text class="rtgt-t">{{ optLabel }}</text>
          <view class="rtgt-a"></view>
        </view>
      </picker>
    </view>

    <input
      v-model="condText"
      class="rin"
      :placeholder="cond === 'kw' ? '关键词，逗号分隔：拿铁,美式' : '正则，比如 早餐|午饭|晚饭'"
      placeholder-class="rph"
    />
    <input v-model="exText" class="rin" placeholder="排除条件，可留空" placeholder-class="rph" />

    <view class="rbtns">
      <view class="rbtn rbtn-main" @click="save"><text class="rbtn-t rbtn-main-t">{{ isNew ? '创建' : '保存' }}</text></view>
      <view class="rbtn" @click="$emit('cancel')"><text class="rbtn-t">取消</text></view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { riskyRegex, ruleTarget, ruleTargetOptions, newRuleId } from '../stores/db'

const props = defineProps({
  /* null = 新增；传规则进来就用它填表 */
  rule: { type: Object, default: null }
})
const emit = defineEmits(['save', 'cancel'])

const isNew = computed(function () { return !props.rule })
const opts = computed(function () { return ruleTargetOptions() })

/* 表里的这几样是草稿：点「取消」就一个字段都没写回去。
   直接改 props.rule 的话，取消就成了「改了一半」—— 那是弹窗最容易被做错的地方。 */
const name = ref('')
const cond = ref('kw')
const condText = ref('')
const exText = ref('')
const picked = ref(0)

watch(opts, function (list) {
  if (picked.value >= list.length) picked.value = 0
})

watch(function () { return props.rule }, function (r) {
  name.value = r ? (r.t || '') : ''
  cond.value = (r && r.re) ? 're' : 'kw'
  condText.value = r ? (cond.value === 're' ? (r.re || '') : (r.kw || '')) : ''
  exText.value = r ? (r.ex || '') : ''
  const i = opts.value.findIndex(function (o) { return o.v === (r && r.to) })
  /* 新增时默认落在「热量摄入」那条上 —— 它是新手第一句最可能想记的东西，
     而落到一个不存在的默认上会让人以为规则没生效。 */
  picked.value = i >= 0 ? i : (isNew.value ? opts.value.findIndex(function (o) { return o.v === 'rt_kcal_in' }) : 0)
  if (picked.value < 0) picked.value = 0
}, { immediate: true })

const optLabel = computed(function () {
  const o = opts.value[picked.value]
  return '存成 · ' + (o ? o.t : '（没有可选项）')
})

function setCond(c) {
  if (cond.value === c) return
  /* 两种写法不是同一种东西，换过去还留着旧内容，等于保存了一条没人看得懂的规则。 */
  cond.value = c
  condText.value = ''
}

function onPick(e) {
  picked.value = Number(e.detail.value) || 0
}

function save() {
  const raw = condText.value.trim()
  if (!raw) { uni.showToast({ title: '先写要匹配什么', icon: 'none' }); return }
  if (cond.value === 're') {
    try { new RegExp(raw) } catch (e) {
      uni.showToast({ title: '这个正则写错了，改一下', icon: 'none' })
      return
    }
    if (riskyRegex(raw)) {
      uni.showToast({ title: '这个正则可能把页面卡死，换个写法', icon: 'none' })
      return
    }
  }
  const to = (opts.value[picked.value] || {}).v
  if (!ruleTarget(to)) { uni.showToast({ title: '这个目标已经不存在了，重选一个', icon: 'none' }); return }

  const rec = {
    id: isNew.value ? newRuleId() : props.rule.id,
    sys: false,
    on: isNew.value ? true : props.rule.on !== false,
    t: name.value.trim() || raw,
    kw: cond.value === 'kw' ? raw : '',
    re: cond.value === 're' ? raw : '',
    ex: exText.value.trim(),
    to: to
  }
  /* max 不在表里，但从旧数据/种子来的规则可能带着它 —— 保存别把它抹掉。 */
  if (!isNew.value && props.rule.max) rec.max = props.rule.max
  emit('save', rec)
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
  margin-bottom: 8px;
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
  margin-bottom: 8px;
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
  min-width: 52px;
  height: 30px;
  border-radius: 6px;
}
.segsm-t { font-size: 12px; color: var(--sub); }
.segsm-b.is-on { background: var(--accent); }
.segsm-b.is-on .segsm-t { color: #fff; }

.rtgt { flex: 1 1 auto; min-width: 0; margin-left: 8px; }
.rtgt-b {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 10px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 8px;
}
/* 下拉箭头用边框画，和「自定义」列表那对三角一个来路：字符字形各机型会歪 */
.rtgt-t {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--sub);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.rtgt-a {
  flex: 0 0 auto;
  margin-left: 6px;
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--sub);
}

.rbtns { display: flex; flex-direction: row; }
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
