<template>
  <view class="page">
    <view class="pagehead"><text class="ph-t">收集</text></view>

    <view class="quick">
      <input
        v-model="draft"
        class="quick-in"
        placeholder="想到什么就写下来，先扔进收件箱"
        confirm-type="done"
        @confirm="save"
      />
      <view class="quick-btn" @click="save"><text class="quick-btn-t">存下</text></view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">收件箱</text>
        <text class="block-note">{{ db.INBOX.length ? (db.INBOX.length + ' 条待归类') : '空的' }}</text>
      </view>
      <view v-if="!db.INBOX.length" class="empty">
        <text class="empty-t">收件箱是空的。它只管「先记下来，别丢」。</text>
      </view>
      <view v-for="it in db.INBOX" :key="it.id" class="row">
        <view class="row-main">
          <text class="row-t">{{ it.text }}</text>
          <text class="row-m">记于 {{ fmtCN(it.at) }} · 没有领域</text>
        </view>
        <view class="chip" @click="classify(it)"><text class="chip-t">归类</text></view>
        <view class="del" @click="remove(it)"><text class="del-t">×</text></view>
      </view>
      <view v-if="db.INBOX.length" class="note">
        <text class="note-t">归类就是把它变成别处的正经条目，然后从这里消失。</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { db, fmtCN, addInbox, addTodo } from '../stores/db'

const draft = ref('')

function save() {
  const t = draft.value.trim()
  if (!t) return
  addInbox(t)
  draft.value = ''
  uni.showToast({ title: '存下了', icon: 'none' })
}

/* 归类 = 变成今天的待办，然后从收件箱消失。
   原型里这一步是选去处（哪个领域 / 待办 / 随心记），这里先只做「变成待办」——
   等速记那套规则引擎搬完，两条路合到一处再补其它去处。 */
function classify(it) {
  addTodo(it.text, '')
  drop(it)
  uni.showToast({ title: '已归到今天的待办', icon: 'none' })
}

function remove(it) {
  uni.showModal({
    title: '删掉这条？',
    content: it.text,
    success: function (r) {
      if (!r.confirm) return
      drop(it)
      uni.showToast({ title: '已删除', icon: 'none' })
    }
  })
}

function drop(it) {
  const i = db.INBOX.indexOf(it)
  if (i >= 0) db.INBOX.splice(i, 1)
}
</script>

<style scoped>
.page {
  padding: 14px 14px calc(76px + env(safe-area-inset-bottom));
}

.pagehead { padding: 4px 46px 12px 2px; }
.ph-t { font-size: 22px; font-weight: 500; color: var(--text); }

.quick {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 14px;
  padding: 6px 6px 6px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.quick-in { flex: 1 1 auto; min-width: 0; height: 34px; }
.quick-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 14px;
  background: var(--accent);
  border-radius: 8px;
}
.quick-btn-t { color: #fff; font-size: 13px; }

.block {
  padding: 10px 14px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.block-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 6px;
}
.tag { font-size: 14px; font-weight: 500; color: var(--text); }
.block-note { font-size: 12px; color: var(--muted); }

.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 46px;
  border-top: 1px solid var(--line);
}
.row-main { flex: 1 1 auto; min-width: 0; padding: 6px 0; }
.row-t { display: block; font-size: 14px; color: var(--text); }
.row-m { display: block; margin-top: 1px; font-size: 12px; color: var(--muted); }

.chip {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 5px 12px;
  margin-left: 8px;
  border: 1px solid var(--line2);
  border-radius: 999px;
}
.chip-t { font-size: 12px; color: var(--sub); }
.chip:active { background: var(--bg); }

.del {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-left: 4px;
  border-radius: 8px;
}
.del-t { font-size: 17px; color: var(--muted); }
.del:active { background: var(--bg); }

.note { padding-top: 10px; }
.note-t { font-size: 12px; line-height: 1.5; color: var(--muted); }

.empty { padding: 12px 0 16px; }
.empty-t { font-size: 13px; line-height: 1.5; color: var(--muted); }
</style>
