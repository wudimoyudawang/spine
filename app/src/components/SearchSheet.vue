<template>
  <view v-if="on" class="modal">
    <view class="modal-mask" @click="$emit('close')"></view>

    <view class="modal-box">
      <view class="modal-h">
        <text class="modal-t">搜索</text>
        <text class="modal-note">{{ res ? (res.total + ' 条') : '全本机' }}</text>
      </view>

      <view class="field">
        <input :maxlength="-1" v-model="q" class="inline-in" :focus="focusInput"
               placeholder="搜待办、记账、随心记、习惯……" confirm-type="search" />
      </view>

      <!-- 搜索框留在外面（改关键词不用滚回去），滚的只有结果 -->
      <view class="modal-body">
      <view class="sr-list">
        <view v-if="!res" class="sr-none">
          <text class="sr-none-t">输入要找的字。搜的是这台设备上的全部。</text>
        </view>
        <view v-else-if="!res.total" class="sr-none">
          <text class="sr-none-t">没有匹配的</text>
        </view>
        <template v-else>
          <view v-for="g in GROUPS" :key="g.k" class="sr-grp">
            <template v-if="res[g.k].length">
              <text class="sr-grp-t">{{ g.n }}</text>
              <view
                v-for="r in res[g.k]"
                :key="g.k + r.id"
                class="sr-row"
                :class="{ 'is-live': !!r.spec }"
                @click="openRow(r)"
              >
                <view class="sr-main">
                  <text class="sr-t" :class="{ 'is-done': r.done }">{{ r.title }}</text>
                  <text class="sr-s">{{ r.sub }}</text>
                </view>
                <text v-if="r.spec" class="sr-go">改</text>
              </view>
            </template>
          </view>
        </template>
      </view>
      </view>

      <view class="modal-f">
        <text class="modal-hint">能改的那几行，点一下直接进编辑。</text>
        <view class="btn btn-main" @click="$emit('close')"><text class="btn-t btn-main-t">完成</text></view>
      </view>
    </view>
  </view>
</template>

<script setup>
/* 全局搜索。放在页头那颗放大镜后面，全应用共用这一个。
 * 搜到的东西分两类对待：
 *   待办 / 习惯 / 支出 —— 点一下直接进编辑（先收起搜索，不然两层弹窗叠着）；
 *   计划 / 随心记 / 收集箱 —— 只展示。前两类有现成的编辑弹窗，
 *   后三类要么编辑要走进度弹窗（还没搬）、要么本来就是只读的，
 *   给一颗点不动的「改」比不给更糟。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { searchAll, openEdit } from '../stores/db'

const props = defineProps({
  on: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])

const q = ref('')
const focusInput = ref(false)

/* 每次打开都清掉上回的字：搜「报销」关掉，下回打开还停在那几个字上，
   看着像是搜索坏了 */
watch(() => props.on, function (v) {
  if (!v) return
  q.value = ''
  focusInput.value = false
  nextTick(function () { focusInput.value = true })
})

const res = computed(function () { return searchAll(q.value) })

const GROUPS = [
  { k: 'todos', n: '待办' },
  { k: 'habits', n: '习惯' },
  { k: 'goals', n: '计划' },
  { k: 'money', n: '支出' },
  { k: 'notes', n: '随心记' },
  { k: 'inbox', n: '收集箱' }
]

function openRow(r) {
  if (!r.spec) return
  emit('close')
  const x = openEdit(r.spec)
  if (x && x.error) uni.showToast({ title: x.error, icon: 'none' })
}
</script>

<style scoped>
/* 结果区的高度由外面的 .modal-body 管（它自己会滚），
   这里不再设上限 —— 两层各滚各的，滚轮会打架 */
.sr-list { }
.sr-none { padding: 14px 0; }
.sr-none-t { font-size: 13px; color: var(--muted); }
.sr-grp { margin-bottom: 10px; }
.sr-grp-t {
  display: block;
  padding: 6px 0 2px;
  font-size: 11px;
  color: var(--muted);
}
.sr-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 40px;
  border-top: 1px solid var(--line);
}
/* 只有能改的行才给点下去的反馈 —— 不能改的那几行灰字本来就说明了它只读 */
.sr-row.is-live:active { background: var(--bg); }
.sr-main { flex: 1 1 auto; min-width: 0; padding: 5px 0; }
.sr-t { display: block; font-size: 14px; color: var(--text); overflow-wrap: break-word; }
.sr-t.is-done { color: var(--muted); text-decoration: line-through; }
.sr-s { display: block; margin-top: 1px; font-size: 11px; color: var(--muted); }
.sr-go { flex: none; margin-left: 8px; font-size: 12px; color: var(--accent); }
</style>
