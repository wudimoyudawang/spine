<template>
  <view class="page">
    <view class="pagehead"><text class="ph-t">随心记</text></view>

    <view class="block">
      <textarea :maxlength="-1"
        v-model="draft"
        class="ta"
        placeholder="随便写。没有标题、没有分类、没有必填项。"
      />
      <view class="hint"><text class="hint-t">今天可以想想：{{ prompt }}</text></view>
      <view class="chips">
        <view class="btn btn-main" @click="save"><text class="btn-t btn-main-t">存下</text></view>
        <view class="btn" @click="nextPrompt"><text class="btn-t">换一个提示</text></view>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">过去写过的</text>
        <text class="block-note">{{ db.NOTES.length ? (db.NOTES.length + ' 条 · 按天倒序') : '' }}</text>
      </view>
      <view v-if="!db.NOTES.length" class="empty">
        <text class="empty-t">还没有写过。上面那个框随便写点什么就行。</text>
      </view>
      <view v-for="n in rows" :key="n.id" class="noteitem">
        <view class="noteitem-d">
          <text class="noteitem-day">{{ fmtCN(n.d) }}</text>
          <view class="delbtn" :class="{ 'is-armed': armed === 'note:' + n.id }" @click="del(n)">
            <text class="delbtn-t" :class="{ 'is-armed': armed === 'note:' + n.id }">{{ armed === 'note:' + n.id ? '确认删' : '×' }}</text>
          </view>
        </view>
        <text class="noteitem-c">{{ n.text }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { db, fmtCN, addNote, armDelete, delArmed, saveState } from '../stores/db'

const draft = ref('')
const armed = delArmed
const prompt = ref((db.NOTE_PROMPTS || [])[0] || '')

const rows = computed(function () {
  return db.NOTES.slice().sort(function (a, b) { return a.d < b.d ? 1 : (a.d > b.d ? -1 : 0) })
})

/* 换一个提示：在同一个列表里往下走一格，走到头绕回第一个。
   不用随机 —— 随机连着两次可能给同一句，看起来就像没换。 */
function nextPrompt() {
  const list = db.NOTE_PROMPTS || []
  if (!list.length) return
  const i = list.indexOf(prompt.value)
  prompt.value = list[(i + 1) % list.length]
}

function save() {
  const t = draft.value.trim()
  if (!t) return
  addNote(t)
  draft.value = ''
  saveState(true)
  uni.showToast({ title: '存下了', icon: 'none' })
}

/* 删和别处同一套两段确认，不再弹系统对话框。 */
function del(n) {
  const r = armDelete('note:' + n.id)
  if (!r) { uni.showToast({ title: '再点一次「确认删」', icon: 'none' }); return }
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  saveState(true)
  uni.showToast({ title: '已删除', icon: 'none' })
}
</script>

<style scoped>
.page {
  padding: 14px 14px calc(76px + env(safe-area-inset-bottom));
}

.pagehead { padding: 4px 46px 12px 2px; }
.ph-t { font-size: 22px; font-weight: 500; color: var(--text); }

.block {
  margin-bottom: 14px;
  padding: 12px 14px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.ta {
  width: 100%;
  height: 96px;
  line-height: 1.55;
}
.hint { padding: 8px 0 10px; }
.hint-t { font-size: 12px; color: var(--muted); }

.chips { display: flex; flex-direction: row; }
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  margin-right: 10px;
  border: 1px solid var(--line2);
  border-radius: 10px;
}
.btn-t { font-size: 13px; color: var(--text); }
.btn-main { background: var(--accent); border-color: var(--accent); }
.btn-main-t { color: #fff; }
.btn:active { background: var(--bg); }

.block-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 8px;
}
.tag { font-size: 14px; font-weight: 500; color: var(--text); }
.block-note { font-size: 12px; color: var(--muted); }

.noteitem {
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.noteitem-d {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.noteitem-day { font-size: 12px; color: var(--muted); }
.noteitem-c {
  display: block;
  margin-top: 4px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
}

.delbtn {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  padding: 0 6px;
  border-radius: 8px;
}
.delbtn-t { font-size: 15px; color: var(--muted); }
.delbtn.is-armed { background: var(--danger-bg); }
.delbtn-t.is-armed { font-size: 12px; color: var(--danger); }
.delbtn:active { background: var(--bg); }

.empty { padding: 12px 0 4px; }
.empty-t { font-size: 13px; line-height: 1.5; color: var(--muted); }
</style>
