<template>
  <view class="tnode">
    <view class="trow" :style="'padding-left:' + (depth * 18) + 'px'" @click="tapRow">
      <!-- 折叠三角。没有子项时也占着这个位置（藏起来），否则同一列的名字会左右跳 -->
      <view class="caret" :class="{ 'is-leaf': !kids, 'is-closed': closed }" @click.stop="$emit('fold')">
        <view class="caret-tri"></view>
      </view>

      <!-- 前导位：待办的勾选框放这儿 —— 名字左边，离行尾那排按钮远一点，
           免得手滑一下把「已完成」按成了「删掉」。不传就没有 -->
      <slot name="lead" />

      <view class="row-main"><slot /></view>

      <text v-if="kids" class="kidb">{{ kids }} 项</text>

      <!-- 类型特有的那一段：打卡按钮 / 进度条。行壳是共用的，尾巴不是 -->
      <slot name="tail" />

      <view class="nodebtn" @click.stop="$emit('add')">
        <PlusIcon :size="14" />
      </view>

      <view class="delbtn" :class="{ 'is-armed': armed }" @click.stop="$emit('del')">
        <text class="delbtn-t" :class="{ 'is-armed': armed }">{{ armed ? '确认删' : '×' }}</text>
      </view>
    </view>

    <!-- 就地一行输入框，不弹窗。一条子项就是一句话，弹窗会逼人填不该填的字段。
         它插在**这一行的正下面**，所以看得出来要给谁加子项。 -->
    <view v-if="addOn" class="subin">
      <input :maxlength="-1"
        v-model="text"
        class="subin-in"
        :focus="true"
        :placeholder="addPh"
        confirm-type="done"
        @confirm="commit"
        @blur="loseFocus"
      />
      <view class="subin-b" @click="commit"><text class="subin-b-t">加</text></view>
      <view class="subin-b" @click="cancel"><text class="subin-b-t">取消</text></view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import PlusIcon from './PlusIcon.vue'

const props = defineProps({
  depth: { type: Number, default: 0 },
  kids: { type: Number, default: 0 },
  closed: { type: Boolean, default: false },
  addOn: { type: Boolean, default: false },
  armed: { type: Boolean, default: false },
  /* 计划行走它自己的弹窗（进度滑杆），整行点开在那一轮才接 */
  openable: { type: Boolean, default: true },
  addPh: { type: String, default: '子项内容，回车建好' }
})
const emit = defineEmits(['open', 'fold', 'add', 'del', 'sub'])

const text = ref('')

/* 每次展开都从空开始：上一次没提交的字留在框里，会被人当成已经记下了 */
watch(() => props.addOn, function (v) { if (v) text.value = '' })

function tapRow() {
  if (props.openable) emit('open')
}
function commit() {
  const t = String(text.value || '').trim()
  emit('sub', t)
  text.value = ''
}
function cancel() {
  emit('sub', '')
  text.value = ''
}
/* 点别处也收起来。uni-app 的 input 没有 blur-then-click 的先后保证，
   所以这里只管把框收掉，不试图读它的内容 —— 要提交得按「加」或回车。 */
function loseFocus() {
  if (text.value.trim()) return
  emit('sub', '')
}
</script>

<style scoped>
.tnode { border-top: 1px solid var(--line); }
.trow {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 46px;
}
.row-main { flex: 1 1 auto; min-width: 0; padding: 6px 0; }

.caret {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 26px;
}
.caret.is-leaf { visibility: hidden; }
/* 三角形用边框画，不用 ▸▾ 字符：各机型的字形和基线不一致，会看着歪 */
.caret-tri {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--muted);
}
.caret.is-closed .caret-tri {
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-left: 5px solid var(--muted);
  border-right: 0;
}

.kidb {
  flex: none;
  margin-right: 4px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--bg);
  font-size: 11px;
  color: var(--muted);
}

/* 加子项那颗 +：虚线框 + PlusIcon。
   虚线框留着 —— 它表示「这里能加」，和旁边那个实心的删除按钮区分开。
   不用文字「+」：它旁边就是计划行的 +1/+2/+5，两个文字加号挨着会长得一样 */
.nodebtn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 30px;
  height: 30px;
  margin-left: 6px;
  border: 1px dashed var(--line2);
  border-radius: 8px;
  /* PlusIcon 用 currentColor，颜色从这儿继承 */
  color: var(--sub);
}
.nodebtn:active { background: var(--bg); }

.delbtn {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 8px;
}
.delbtn-t { font-size: 15px; color: var(--muted); }
/* 第一下只武装，第二下才真删 */
.delbtn.is-armed { background: var(--danger-bg); }
.delbtn-t.is-armed { font-size: 12px; color: var(--danger); }

.subin {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 6px 0 8px;
  background: var(--bg);
}
.subin-in {
  flex: 1 1 auto;
  min-width: 0;
  height: 36px;
  margin: 0 8px 0 12px;
  padding: 0 10px;
  background: var(--card);
  border: 1px solid var(--line2);
  border-radius: 8px;
}
.subin-b {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 12px;
  margin-right: 6px;
  border-radius: 15px;
  background: var(--card);
}
.subin-b-t { font-size: 12px; color: var(--sub); }
.subin-b:active { background: var(--line); }
</style>
