<template>
  <view class="page">
    <view class="pagehead">
      <text class="ph-t">今日</text>
      <text class="ph-d">{{ headDate }}</text>
    </view>

    <!-- 记一笔 / 写一件事。
         这一轮先做最简单的判断：数字在开头 → 记成支出，否则 → 待办。
         原型那套完整规则（关键词、正则、你自己写的规则、品类胶囊）下一轮搬。 -->
    <view class="capture">
      <input
        v-model="draft"
        class="cap-in"
        :focus="capFocus"
        placeholder="32 午餐 / 交房租 / 想学 GraphRAG"
        confirm-type="done"
        @confirm="submit"
      />
      <view class="cap-go" @click="submit"><text class="cap-go-t">记下</text></view>
    </view>

    <!-- 已过期。排在最前面 —— 这一天的第一眼该看见最欠着的那些事。 -->
    <view v-if="today.overdue.length" class="block">
      <view class="block-h">
        <text class="tag tag-warn">已过期</text>
        <text class="block-note">{{ today.overdue.length }} 条</text>
      </view>
      <view v-for="it in today.overdue" :key="it.id" class="row">
        <view class="row-main">
          <text class="row-t">{{ it.title }}</text>
          <text class="row-m">{{ it.domain }} · {{ it.due.slice(5) }} 到期</text>
        </view>
        <view class="tick" @click="finish(it)"><text class="tick-t">完成</text></view>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">今天</text>
        <text class="block-note">{{ today.due.length }} 条待办</text>
      </view>
      <view v-if="!today.due.length" class="empty"><text class="empty-t">今天没有到期的待办</text></view>
      <view v-for="it in today.due" :key="it.id" class="row">
        <view class="row-main">
          <text class="row-t">{{ it.title }}</text>
          <text class="row-m">{{ it.domain }}</text>
        </view>
        <view class="tick" @click="finish(it)"><text class="tick-t">完成</text></view>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">习惯</text>
        <text class="block-note">点右边打卡</text>
      </view>
      <view v-for="h in habits" :key="h.id" class="row">
        <view class="row-main">
          <text class="row-t">{{ h.t }}</text>
          <text class="row-m">{{ h.m }} · 连续 {{ habitStreakDays(h.id, TODAY) }} 天 · 累计 {{ habitTotalDays(h.id) }} 天</text>
        </view>
        <view class="tick" :class="{ 'is-on': habitDoneOn(h.id, TODAY) }" @click="tick(h.id)">
          <text class="tick-t">{{ habitDoneOn(h.id, TODAY) ? '已打卡' : '打卡' }}</text>
        </view>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">今天记下的</text>
        <text class="block-note">{{ money(todaySum) }}</text>
      </view>
      <view v-if="!todayLogs.length" class="empty"><text class="empty-t">今天还没记账</text></view>
      <view v-for="l in todayLogs" :key="l.id" class="row">
        <view class="row-main">
          <text class="row-t">{{ l.category || '未分类' }}</text>
          <text class="row-m">支出</text>
        </view>
        <text class="row-v">{{ money(l.value) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  db, TODAY, money, pickToday, weekdayCN, captureAsk,
  habitDoneOn, habitStreakDays, habitTotalDays, toggleHabitLog,
  addMoney, addTodo, guessCategory
} from '../stores/db'

const draft = ref('')
const capFocus = ref(false)

/* 底部栏那颗「记一笔」是这么接上的：它把 captureAsk 加一，这里收到就把光标送进输入框。
   用自增计数当信号而不是布尔量 —— 人在今日页上连点两次，也得两次都有反应。
   赋值前先放掉（false），下个 tick 再拿起（true）：不做出这个跳变，
   第二次点的时候 focus 一直是 true，不会重新聚焦。 */
watch(captureAsk, function () {
  capFocus.value = false
  nextTick(function () { capFocus.value = true })
})

const headDate = computed(function () {
  const p = TODAY.split('-').map(Number)
  return p[1] + ' 月 ' + p[2] + ' 日 · 周' + weekdayCN(TODAY)
})

const today = computed(() => pickToday(db.ITEMS, TODAY))

const habits = computed(function () {
  const out = []
  for (const d of db.DOMAINS) {
    for (const h of (d.habits || [])) out.push(h)
  }
  return out
})

const todayLogs = computed(() => db.LOGS.filter(l => l.date === TODAY))
const todaySum = computed(() =>
  todayLogs.value.reduce((s, l) => s + Number(l.value || 0), 0)
)

function tick(id) {
  const on = toggleHabitLog(id, TODAY)
  uni.showToast({ title: on ? '已打卡' : '已取消今天的打卡', icon: 'none' })
}

function finish(it) {
  it.status = 'done'
  uni.showToast({ title: '完成了', icon: 'none' })
}

function submit() {
  const t = draft.value.trim()
  if (!t) return
  /* 「数字在开头」才当金额 —— 写成「交房租 2000」不该被记成 2000 元的一笔，
     那是待办。完整的判断规则（原型的规则表）下一轮搬过来。 */
  const m = /^\s*[¥￥]?\s*(\d+(?:\.\d+)?)/.exec(t)
  if (m) {
    const rec = addMoney(Number(m[1]), t, guessCategory(t))
    uni.showToast({ title: rec ? ('记下 ' + money(rec.value)) : '金额不对', icon: 'none' })
  } else {
    addTodo(t, '')
    uni.showToast({ title: '记成待办', icon: 'none' })
  }
  draft.value = ''
}
</script>

<style scoped>
.page {
  /* 底部留白只要让开底部栏。「记一笔」已经进了栏里，
     不再有浮在栏上方的那颗按钮，所以不用再多留那 46px。 */
  padding: 14px 14px calc(76px + env(safe-area-inset-bottom));
}

.pagehead {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding: 4px 46px 12px 2px;
}
.ph-t { font-size: 22px; font-weight: 500; color: var(--text); }
.ph-d { font-size: 13px; color: var(--sub); }

.capture {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 6px 6px 6px 12px;
  margin-bottom: 14px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.cap-in { flex: 1 1 auto; min-width: 0; height: 34px; }
.cap-go {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 14px;
  background: var(--accent);
  border-radius: 8px;
}
.cap-go-t { color: #fff; font-size: 13px; }

.block {
  margin-bottom: 14px;
  padding: 10px 14px 4px;
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
.tag-warn { color: var(--warn); }
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
.row-m { display: block; font-size: 12px; color: var(--muted); margin-top: 1px; }
.row-v { font-size: 14px; color: var(--text); }

.tick {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 6px 14px;
  margin-left: 8px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  background: var(--card);
}
.tick-t { font-size: 13px; color: var(--sub); }
.tick.is-on { background: var(--ok-bg); border-color: var(--ok); }
.tick.is-on .tick-t { color: var(--ok); }
.tick:active { background: var(--bg); }

.empty { padding: 12px 0 16px; }
.empty-t { font-size: 13px; color: var(--muted); }
</style>
