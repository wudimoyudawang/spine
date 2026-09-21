<template>
  <view class="page">
    <view class="pagehead"><text class="ph-t">空间</text></view>

    <view class="grid">
      <view v-for="d in db.DOMAINS" :key="d.id" class="card" @click="openDomain(d)">
        <view class="card-top">
          <text class="card-t">{{ d.name }}</text>
          <view class="pin" :class="{ 'is-on': d.pinned }" @click.stop="pin(d)">
            <text class="pin-t">{{ d.pinned ? '★' : '☆' }}</text>
          </view>
        </view>
        <text class="card-s">{{ summary(d) }}</text>
      </view>

      <!-- 记账：内置的特殊空间。
           整张卡上**没有任何操作入口** —— 没有置顶的星、没有改名、没有删除。
           它不是 DOMAINS 里的成员，是渲染时多出来的一张卡（见 stores/db.js 的说明）。 -->
      <view class="card card-fixed" @click="openMoney">
        <view class="card-top">
          <text class="card-t">记账</text>
          <text class="card-badge">固定</text>
        </view>
        <text class="card-s">{{ moneySummary }}</text>
      </view>

      <view class="card card-add" @click="add">
        <text class="card-t card-add-t">+ 新建领域</text>
        <text class="card-s">考证 / 育儿 / 副业 …</text>
      </view>
    </view>

    <view class="note">
      <text class="note-t">一张卡就是一个领域，点进去管它下面的习惯、待办和目标。</text>
    </view>

    <!-- ============ 设置（往下滑就到） ============
         两段在同一个滚动里，所以右上角那颗齿轮只需要一个入口：
         它把人带到这一页的顶上，往下滑就是设置。 -->
    <view class="sect"><text class="sect-t">设置</text></view>

    <view class="block">
      <view class="block-h">
        <text class="tag">快记类目</text>
        <text class="block-note">首页速记里出现的</text>
      </view>
      <view v-for="m in db.CAPTURE_MODES" :key="m.k" class="srow">
        <text class="srow-k">{{ m.t }}</text>
        <text class="srow-v">{{ m.on ? (m.lock ? '常开' : '开') : '关' }}</text>
      </view>
      <view class="note"><text class="note-t">自动判断的规则表下一轮搬过来。</text></view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">记账品类</text>
        <text class="block-note">{{ db.CATS.length }} 个</text>
      </view>
      <view class="pills">
        <text v-for="c in db.CATS" :key="c" class="pill">{{ c }}</text>
      </view>
      <view class="note"><text class="note-t">删掉一个品类只去掉选项，已记的流水一个字不改。</text></view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">数据</text>
        <text class="block-note">都在本机</text>
      </view>
      <view class="srow">
        <text class="srow-k">本机存储</text>
        <text class="srow-v">{{ storeText }}</text>
      </view>
      <view class="chips">
        <view class="btn btn-main" @click="exportData"><text class="btn-t btn-main-t">复制全部数据</text></view>
      </view>
      <view class="note"><text class="note-t">导出一份 JSON，换手机或备份都用它。</text></view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">这一版不做的</text>
        <text class="block-note">都是定好的，不是漏了</text>
      </view>
      <view class="srow"><text class="srow-k">账号、登录、多端同步</text><text class="srow-v">第 5 步</text></view>
      <view class="srow"><text class="srow-k">AI 语义识别</text><text class="srow-v">现在用规则表</text></view>
      <view class="srow"><text class="srow-k">手机推送提醒</text><text class="srow-v">不做</text></view>
    </view>

    <view class="block">
      <view class="block-h"><text class="tag">外观</text><text class="block-note">先做浅色，够用</text></view>
      <view class="srow"><text class="srow-k">主题</text><text class="srow-v">浅色</text></view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import {
  db, go, money, TODAY, summaryOf, recordTypesOf, togglePin, newDomain,
  snapshot, storeFailed
} from '../stores/db'

function summary(d) {
  return summaryOf(d, recordTypesOf(db.RECORD_TYPES, d.id).length)
}

const moneySummary = computed(function () {
  const m = TODAY.slice(0, 7)
  const list = db.LOGS.filter(l => String(l.date).slice(0, 7) === m)
  const sum = list.reduce((s, l) => s + Number(l.value || 0), 0)
  return '本月 ' + money(sum) + ' · ' + list.length + ' 笔'
})

function pin(d) {
  const on = togglePin(d.id)
  uni.showToast({ title: on ? '已加到顶部快捷' : '已取消顶部快捷', icon: 'none' })
}

function openDomain(d) {
  db.DOMAIN_ID = d.id
  go('domain')
  /* 进领域页要停在顶部。上次滚到哪儿是上一次的事，跟这次想看什么没关系。 */
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function openMoney() {
  go('ledger')
}

function add() {
  const d = newDomain()
  uni.showToast({ title: '新建了「' + d.name + '」', icon: 'none' })
}

/* 存储状态如实显示。存不下还一声不吭是最坑的一种错 —— 用户以为记下了，其实没有。 */
const storeText = computed(function () {
  return storeFailed.value ? '这台设备存不了' : '已自动保存'
})

/* 导出 = 复制到剪贴板。
   手机上「导出」的去向通常是贴到别处（备忘录 / 发给自己 / 粘到电脑），
   而下载文件在 App 的 WebView 里得单独接原生写入，那条路先不做。 */
function exportData() {
  uni.setClipboardData({
    data: snapshot(),
    success: function () { uni.showToast({ title: '已复制全部数据', icon: 'none' }) }
  })
}
</script>

<style scoped>
.page {
  /* 底部留白只要让开底部栏。「记一笔」已经进了栏里，
     不再有浮在栏上方的那颗按钮，所以不用再多留 46px。 */
  padding: 14px 14px calc(76px + env(safe-area-inset-bottom));
}

.pagehead { padding: 4px 46px 12px 2px; }
.ph-t { font-size: 22px; font-weight: 500; color: var(--text); }

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.card {
  padding: 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.card:active { background: var(--bg); }
.card-top {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.card-t { font-size: 15px; font-weight: 500; color: var(--text); }
.card-s {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}

.pin { padding: 2px 0 2px 8px; }
.pin-t { font-size: 16px; color: var(--muted); }
.pin.is-on .pin-t { color: var(--warn); }

/* 内置的那张卡：淡蓝底，一眼看出它不是你自己建的 */
.card-fixed { background: var(--accent-bg); border-color: var(--accent); }
.card-badge {
  padding: 1px 6px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  color: var(--accent);
  font-size: 10px;
}

.card-add { border-style: dashed; }
.card-add-t { color: var(--sub); }

.note { padding: 14px 2px 0; }
.note-t { font-size: 12px; line-height: 1.5; color: var(--muted); }

/* ---------------- 设置那一段 ---------------- */
.sect { padding: 12px 2px 10px; }
.sect-t { font-size: 20px; font-weight: 500; color: var(--text); }

.block {
  margin-bottom: 14px;
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
  padding-bottom: 8px;
}
.tag { font-size: 14px; font-weight: 500; color: var(--text); }
.block-note { font-size: 12px; color: var(--muted); }

.srow {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.srow-k { font-size: 14px; color: var(--text); }
.srow-v { font-size: 12px; color: var(--muted); }

.pills { display: flex; flex-direction: row; flex-wrap: wrap; padding: 2px 0 4px; }
.pill {
  margin: 4px 6px 0 0;
  padding: 5px 12px;
  background: var(--bg);
  border-radius: 999px;
  font-size: 13px;
  color: var(--sub);
}

.chips { display: flex; flex-direction: row; padding-top: 10px; }
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--line2);
  border-radius: 10px;
}
.btn-t { font-size: 13px; color: var(--text); }
.btn-main { background: var(--accent); border-color: var(--accent); }
.btn-main-t { color: #fff; }
.btn:active { background: var(--bg); }
</style>
