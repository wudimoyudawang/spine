<template>
  <view class="page">
    <view class="pagehead"><text class="ph-t">收集</text></view>

    <view class="quick">
      <input :maxlength="-1"
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
      <view v-for="it in db.INBOX" :key="it.id">
        <view class="row">
          <view class="row-main">
            <text class="row-t">{{ it.text }}</text>
            <text class="row-m">记于 {{ fmtCN(it.at) }} · 没有领域</text>
          </view>
          <view class="chip" :class="{ 'is-on': open === it.id }" @click="toggle(it.id)">
            <text class="chip-t">{{ open === it.id ? '收起' : '归类' }}</text>
          </view>
          <view class="delbtn" :class="{ 'is-armed': armed === 'inbox:' + it.id }" @click="del(it)">
            <text class="delbtn-t" :class="{ 'is-armed': armed === 'inbox:' + it.id }">{{ armed === 'inbox:' + it.id ? '确认删' : '×' }}</text>
          </view>
        </view>
        <!-- 去处就摊在这一行下面：看完这句要挑的是哪一格，不用抬头找标题 -->
        <view v-if="open === it.id" class="clsbox">
          <text class="cls-k">归到：</text>
          <view
            v-for="o in places"
            :key="o.v"
            class="chip chip-sm"
            @click="classify(it, o.v)"
          >
            <text class="chip-t">{{ o.t }}</text>
          </view>
        </view>
      </view>
      <view v-if="db.INBOX.length" class="note">
        <text class="note-t">归类就是把它变成别处的正经条目，然后从这里消失。</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { db, fmtCN, addInbox, classifyInbox, armDelete, delArmed, saveState } from '../stores/db'

const draft = ref('')
const open = ref('')
const armed = delArmed

/* 去处：两个固定的 + 每个领域一格。领域改名、加领域都跟着这份走。
   「先留着」不算去处，它只是把这一排收起来 —— 所以单独一颗，不混在里面。 */
const places = computed(function () {
  const out = [{ v: 'todo', t: '今天待办' }, { v: 'note', t: '随心记' }]
  for (const d of db.DOMAINS) out.push({ v: d.id, t: d.name })
  out.push({ v: '', t: '先留着' })
  return out
})

function save() {
  const t = draft.value.trim()
  if (!t) return
  addInbox(t)
  draft.value = ''
  saveState(true)
  uni.showToast({ title: '存下了', icon: 'none' })
}

function toggle(id) {
  open.value = open.value === id ? '' : id
}

function classify(it, to) {
  if (!to) { open.value = ''; return }
  const r = classifyInbox(it.id, to)
  open.value = ''
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  saveState(true)
  uni.showToast({ title: '已归到 ' + r.where, icon: 'none' })
}

/* 删和别处同一套两段确认。以前这里弹一个系统对话框 —— 两种删除手势混在一个应用里，
   人会以为自己点错了地方。 */
function del(it) {
  const r = armDelete('inbox:' + it.id)
  if (!r) { uni.showToast({ title: '再点一次「确认删」', icon: 'none' }); return }
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  if (open.value === it.id) open.value = ''
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
/* 面板开着的时候那颗要看得出来是它开的，不然那一排去处像凭空冒出来的 */
.chip.is-on { background: var(--accent-bg); border-color: var(--accent); }
.chip.is-on .chip-t { color: var(--accent); }

/* 去处那一排：紧跟在这条下面，小一号 —— 它是一次选择，不是行上的主钮 */
.clsbox {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  padding: 2px 0 10px;
  border-top: 1px solid var(--line);
}
.cls-k { font-size: 12px; color: var(--muted); }
.clsbox .chip { margin: 6px 0 0 6px; min-height: 26px; padding: 4px 10px; }

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
.delbtn.is-armed { background: var(--danger-bg); }
.delbtn-t.is-armed { font-size: 12px; color: var(--danger); }
.delbtn:active { background: var(--bg); }

.note { padding-top: 10px; }
.note-t { font-size: 12px; line-height: 1.5; color: var(--muted); }

.empty { padding: 12px 0 16px; }
.empty-t { font-size: 13px; line-height: 1.5; color: var(--muted); }
</style>
