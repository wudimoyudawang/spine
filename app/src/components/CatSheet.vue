<template>
  <view v-if="on" class="modal">
    <view class="modal-mask" @click="$emit('close')"></view>

    <view class="modal-box">
      <view class="modal-h">
        <text class="modal-t">{{ isIn ? '收入品类' : '支出品类' }}</text>
        <text class="modal-note">{{ list.length }} 个品类</text>
      </view>

      <!-- 记下的输入框留在上面不滚（和搜索框同一个道理），滚的只有品类列表 -->
      <view class="modal-body">
      <view class="cs-list">
        <view v-if="!list.length && editOn !== 'new'" class="cs-empty">
          <text class="cs-empty-t">还没有{{ isIn ? '收入' : '支出' }}品类。不建也行，记的时候会归到「未分类」。</text>
        </view>

        <view v-for="c in list" :key="c" class="cs-row">
          <view class="cs-main">
            <text class="cs-t">{{ c }}</text>
            <text v-if="usedOf(c)" class="cs-m">记过 {{ usedOf(c) }} 笔</text>
          </view>
          <view class="cs-ops">
            <view class="cs-mini" @click="renameStart(c)">
              <text class="cs-mini-t">{{ editOn === c ? '收起' : '改名' }}</text>
            </view>
            <view class="cs-mini cs-mini-del" @click="delGo(c)">
              <text class="cs-mini-t">{{ armed === catSpec(c) ? '确认删' : '删' }}</text>
            </view>
          </view>

          <!-- 改名的输入行插在**这一条的正下面**，看得出来在改谁 -->
          <view v-if="editOn === c" class="cs-in">
            <input :maxlength="-1" v-model="draft" class="cs-in-in" :focus="focusInput"
                   placeholder="改成叫什么" confirm-type="done" @confirm="commit" />
            <view class="cs-btn cs-btn-main" @click="commit"><text class="cs-btn-t">改名</text></view>
            <view class="cs-btn" @click="editOn = ''"><text class="cs-btn-t">取消</text></view>
          </view>
        </view>

        <!-- 新建的输入行放在列表尾巴上 -->
        <view v-if="editOn === 'new'" class="cs-in">
          <input :maxlength="-1" v-model="draft" class="cs-in-in" :focus="focusInput"
                 placeholder="新品类叫什么，比如「宠物」" confirm-type="done" @confirm="commit" />
          <view class="cs-btn cs-btn-main" @click="commit"><text class="cs-btn-t">创建</text></view>
          <view class="cs-btn" @click="editOn = ''"><text class="cs-btn-t">取消</text></view>
        </view>

        <view v-if="!editOn" class="cs-add" @click="startNew">
          <text class="cs-add-t">＋ 新增品类</text>
        </view>
      </view>
      </view>

      <view class="modal-f">
        <text class="modal-hint">{{ isIn ? '删掉只去掉选项，已记的收入不改；改名会把那几笔一起改。' : '删掉只去掉选项，已记的流水不改；改名会把那几笔一起改。' }}</text>
        <view class="btn btn-main" @click="$emit('close')"><text class="btn-t btn-main-t">完成</text></view>
      </view>
    </view>
  </view>
</template>

<script setup>
/* 记账品类的增删改。**支出和收入各一份清单**（`CATS` / `IN_CATS`），
 * 所以整层带一个 `dir` 入参；数据层那几个函数也都收了尾部的 dir 参数，
 * 这里只是把它透传下去 —— 一套代码服务两份清单，不写第二份。
 *
 * 它不再兼职「记一笔」（2026-10-04）：录入有了自己的一页（`views/pay.vue`），
 * 那个小输入框就是第二个入口做同一件事。这一层从此只管清单本身，
 * 从记账录入页网格末尾那格「分类设置」进来。
 */
import { computed, nextTick, ref, watch } from 'vue'
import {
  db, catList, addCat, renameCat, catUsed, delArmed, saveState
} from '../stores/db'
import { toast, confirmDelete } from '../lib/ui'

const props = defineProps({
  on: { type: Boolean, default: false },
  /* 'out' = 支出（缺省，也是老的唯一行为），'in' = 收入 */
  dir: { type: String, default: 'out' }
})
const emit = defineEmits(['close'])

const isIn = computed(function () { return props.dir === 'in' })
/* 清单走 catList(dir)：它 = 清单本身 + 历史里出现过、已被移出清单的那些。
   直接用 db.CATS 的话，删过一个类之后老记录就再也改不回那个类了。 */
const list = computed(function () { return catList(props.dir) })

const editOn = ref('')   /* 'new' = 正在新建；否则是正在改名的那个品类名 */
const draft = ref('')
const focusInput = ref(false)
const armed = delArmed
/* 两段确认的闸门是全应用共用的（`delArmed`），所以 spec 必须带方向 ——
   不然「支出·餐饮」正在武装时切到收入那边，看着也会是「确认删」。 */
function catSpec(c) { return (isIn.value ? 'incat:' : 'cat:') + c }

/* 每次打开都收起输入框：上回没提交的字留在这儿，会被人当成已经建好了 */
watch(() => props.on, function (v) {
  if (!v) return
  editOn.value = ''
  draft.value = ''
})

function startNew() {
  editOn.value = 'new'
  draft.value = ''
  focus()
}
function renameStart(c) {
  editOn.value = editOn.value === c ? '' : c
  draft.value = editOn.value ? c : ''
  if (editOn.value) focus()
}
/* uni 的 input 有 focus 属性但常常不生效，nextTick 之后再给一次是能生效的写法 */
function focus() {
  focusInput.value = false
  nextTick(function () { focusInput.value = true })
}

function usedOf(c) { return catUsed(c, props.dir) }

function commit() {
  const v = draft.value.trim()
  if (!v) { toast('先写个名字'); return }
  const r = editOn.value === 'new' ? addCat(v, props.dir) : renameCat(editOn.value, v, props.dir)
  if (r.error) { toast(r.error); return }
  editOn.value = ''
  focusInput.value = false
  saveState(true)
  toast(r.moved === undefined ? '已加「' + r.name + '」' : '已改名，' + r.moved + ' 笔也跟着改过来了')
}

function delGo(c) {
  /* 第一下不发提示（按钮自己会变成「确认删」），保持原样 */
  const r = confirmDelete(catSpec(c))
  if (r.armed) return
  if (r.error) { toast(r.error); return }
  if (editOn.value === c) editOn.value = ''
  toast('已去掉「' + r.done.name + '」· 已记的没改')
}
</script>

<style scoped>
/* 记那一笔的输入行：输入框占满，记下那颗钮贴在右头 */
.cs-rec { display: flex; flex-direction: row; align-items: center; padding: 4px 0 2px; }
.cs-rec .inline-in { flex: 1 1 auto; min-width: 0; }
.cs-rec-b {
  flex: none; display: flex; align-items: center; justify-content: center;
  min-height: 34px; margin-left: 8px; padding: 0 14px;
  background: var(--accent); border-radius: 8px;
}
.cs-rec-b-t { color: #fff; font-size: 13px; }
.cs-rec-b:active { background: #2A63D2; }
/* 记那一笔和品类之间的一条分隔：两个用途，不隔开会长成一大团 */
.cs-sep { height: 1px; background: var(--line); margin: 12px 0 4px; }

/* 品类列表的高度由外面的 .modal-body 管（它自己会滚），
   这里不再设上限 —— 两层各滚各的，滚轮会打架 */
.cs-list { }
.cs-empty { padding: 10px 0 6px; }
.cs-empty-t { font-size: 13px; color: var(--muted); }
.cs-row { border-top: 1px solid var(--line); }
.cs-row:first-of-type { border-top: 0; }
.cs-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: row; align-items: baseline; padding: 11px 0; }
.cs-t { font-size: 14px; color: var(--text); }
.cs-m { margin-left: 8px; font-size: 11px; color: var(--muted); }
.cs-row { display: flex; flex-direction: row; align-items: center; }
.cs-ops { flex: none; display: flex; flex-direction: row; align-items: center; }
.cs-mini {
  display: flex; align-items: center; justify-content: center;
  min-height: 28px; margin-left: 6px; padding: 0 10px;
  border: 1px solid var(--line2); border-radius: 14px;
}
.cs-mini-t { font-size: 11px; color: var(--sub); }
.cs-mini:active { background: var(--bg); }
.cs-mini-del:active { background: var(--danger-bg); }
.cs-mini-del:active .cs-mini-t { color: var(--danger); }

.cs-in { display: flex; flex-direction: row; align-items: center; padding: 2px 0 10px; }
.cs-in-in {
  flex: 1 1 auto; min-width: 0; height: 34px; margin-right: 8px; padding: 0 10px;
  background: var(--bg); border: 1px solid var(--line2); border-radius: 8px;
}
.cs-btn {
  flex: none; display: flex; align-items: center; justify-content: center;
  height: 30px; margin-left: 6px; padding: 0 12px;
  border-radius: 15px; background: var(--card); border: 1px solid var(--line2);
}
.cs-btn-main { background: var(--accent); border-color: var(--accent); }
.cs-btn-main .cs-btn-t { color: #fff; }
.cs-btn-t { font-size: 12px; color: var(--sub); }
.cs-btn:active { opacity: .8; }

.cs-add {
  display: flex; align-items: center; justify-content: center;
  min-height: 38px; margin-top: 8px;
  border: 1px dashed var(--line2); border-radius: 9px;
}
.cs-add-t { font-size: 13px; color: var(--accent); }
.cs-add:active { background: var(--accent-bg); }
</style>
