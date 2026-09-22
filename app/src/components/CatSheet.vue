<template>
  <view v-if="on" class="modal">
    <view class="modal-mask" @click="$emit('close')"></view>

    <view class="modal-box">
      <view class="modal-h">
        <text class="modal-t">记一笔</text>
        <text class="modal-note">{{ db.CATS.length }} 个品类</text>
      </view>

      <!-- 记下放在品类的上面：这一层的主用途是记，品类是顺手维护的。
           提交走 commitMoneyText，和记账页上那个框是同一段逻辑。 -->
      <view class="field">
        <text class="field-k">这回花了多少</text>
        <view class="cs-rec">
          <input :maxlength="-1" v-model="recDraft" class="inline-in" :focus="focusRec"
                 placeholder="比如 32 午餐，分类可以留空" confirm-type="done" @confirm="record" />
          <view class="cs-rec-b" @click="record"><text class="cs-rec-b-t">记下</text></view>
        </view>
      </view>

      <view class="cs-sep"></view>

      <!-- 记下的输入框留在上面不滚（和搜索框同一个道理），滚的只有品类列表 -->
      <view class="modal-body">
      <view class="cs-list">
        <view v-if="!db.CATS.length && editOn !== 'new'" class="cs-empty">
          <text class="cs-empty-t">还没有品类。不建也行，记的时候会归到「未分类」。</text>
        </view>

        <view v-for="c in db.CATS" :key="c" class="cs-row">
          <view class="cs-main">
            <text class="cs-t">{{ c }}</text>
            <text v-if="usedOf(c)" class="cs-m">记过 {{ usedOf(c) }} 笔</text>
          </view>
          <view class="cs-ops">
            <view class="cs-mini" @click="renameStart(c)">
              <text class="cs-mini-t">{{ editOn === c ? '收起' : '改名' }}</text>
            </view>
            <view class="cs-mini cs-mini-del" @click="delGo(c)">
              <text class="cs-mini-t">{{ armed === 'cat:' + c ? '确认删' : '删' }}</text>
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
        <text class="modal-hint">删掉只去掉选项，已记的流水不改；改名会把那几笔一起改。</text>
        <view class="btn btn-main" @click="$emit('close')"><text class="btn-t btn-main-t">完成</text></view>
      </view>
    </view>
  </view>
</template>

<script setup>
/* 记账品类的增删改。
 * 做成弹层而不是记账页里的一块：品类是「记一笔的时候偶尔要补一个」的东西，
 * 平时不该在记账页上占一整块 —— 那会让「记一笔」这一眼要看的东西往后退。
 * 增删改的逻辑原样从设置页搬过来（那边的入口已撤），规则没变：
 * 删只去掉选项、已记的流水不改；改名把已记的那几笔一起改过来。
 */
import { nextTick, ref, watch } from 'vue'
import {
  db, money, addCat, renameCat, catUsed, armDelete, delArmed, saveState, commitMoneyText
} from '../stores/db'

const props = defineProps({
  on: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])

const editOn = ref('')   /* 'new' = 正在新建；否则是正在改名的那个品类名 */
const draft = ref('')
const focusInput = ref(false)
const armed = delArmed

/* 记那一笔。只在这层里收支出；分类可以留空（归到「未分类」） */
const recDraft = ref('')
const focusRec = ref(false)

function record() {
  const t = recDraft.value.trim()
  if (!t) { uni.showToast({ title: '先写一句', icon: 'none' }); return }
  const r = commitMoneyText(t)
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  recDraft.value = ''
  focusRec.value = false
  saveState(true)
  uni.showToast({ title: '记下 ' + money(r.rec.value), icon: 'none' })
}

/* 每次打开都收起输入框：上回没提交的字留在这儿，会被人当成已经建好了 */
watch(() => props.on, function (v) {
  if (!v) return
  editOn.value = ''
  draft.value = ''
  recDraft.value = ''
  focusRec.value = false
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

function usedOf(c) { return catUsed(c) }

function commit() {
  const v = draft.value.trim()
  if (!v) { uni.showToast({ title: '先写个名字', icon: 'none' }); return }
  const r = editOn.value === 'new' ? addCat(v) : renameCat(editOn.value, v)
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  editOn.value = ''
  focusInput.value = false
  saveState(true)
  uni.showToast({
    title: r.moved === undefined ? '已加「' + r.name + '」' : '已改名，' + r.moved + ' 笔也跟着改过来了',
    icon: 'none'
  })
}

function delGo(c) {
  const r = armDelete('cat:' + c)
  if (!r) return
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  if (editOn.value === c) editOn.value = ''
  saveState(true)
  uni.showToast({ title: '已去掉「' + r.name + '」· 已记的没改', icon: 'none' })
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
