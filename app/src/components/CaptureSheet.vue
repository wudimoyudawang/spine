<template>
  <view v-if="db.CAP_OPEN" class="capwrap">
    <view class="capmask" @click="close"></view>

    <view class="capbox">
      <!-- 右上角：管「提交完这个面板自己收不收」。
           它同时是设置页里的一条，两处改的是同一个值。 -->
      <view class="caphead">
        <view class="autoclose" @click="toggleAutoClose">
          <text class="autoclose-t">记完自动关</text>
          <view class="sw" :class="{ 'is-on': db.CAP_AUTO_CLOSE }"><view class="sw-dot"></view></view>
        </view>
      </view>

      <!-- 记账：先挑品类，再填金额。
           这条路上没有「自动判断」—— 选了记账就是「我知道这是支出、我要分类」，
           再让规则去猜，等于把你的明确意图当成猜测的输入。 -->
      <template v-if="kind === 'money'">
        <view class="cats">
          <view
            v-for="c in cats"
            :key="c"
            class="mchip"
            :class="{ 'is-on': picked === c }"
            @click="picked = c"
          >
            <text class="mchip-t">{{ c }}</text>
          </view>
        </view>
        <input
          v-model="amount"
          class="capin"
          type="digit"
          :focus="focused"
          placeholder="金额，比如 32"
          confirm-type="done"
          @confirm="submit"
        />
      </template>

      <!-- 记一笔：写什么都行，规则自己判 -->
      <template v-else>
        <input
          v-model="draft"
          class="capin capin-first"
          :focus="focused"
          placeholder="想记什么就写什么：事情、金额、热量、体重、一句话"
          confirm-type="done"
          @confirm="submit"
        />
        <scroll-view class="modes" scroll-x :show-scrollbar="false">
          <view
            v-for="m in modes"
            :key="m.k"
            class="mchip"
            :class="{ 'is-on': mode === m.k }"
            @click="mode = m.k"
          >
            <text class="mchip-t">{{ m.t }}</text>
          </view>
        </scroll-view>
      </template>

      <!-- 切换器紧贴在「记下」上面：手在下半屏操作时，它就在指头边上 -->
      <view class="kindsw">
        <view class="kindsw-b" :class="{ 'is-on': kind === 'quick' }" @click="setKind('quick')">
          <text class="kindsw-t">记一笔</text>
        </view>
        <view class="kindsw-b" :class="{ 'is-on': kind === 'money' }" @click="setKind('money')">
          <text class="kindsw-t">记账</text>
        </view>
      </view>

      <view class="capgo" @click="submit"><text class="capgo-t">记下</text></view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  db, money, catList, guessCategory, addMoney, addTodo, closeCapture
} from '../stores/db'

const draft = ref('')
const amount = ref('')
const picked = ref('')
const mode = ref('auto')
const focused = ref(false)

const kind = computed(function () { return db.CAPTURE_KIND })

const cats = computed(function () { return catList() })

/* 「记一笔支出」这个模式不在这儿了 —— 支出走「记账」那条路。
   两边都留着，等于两个入口做同一件事，用一阵子就分不清该点哪个。 */
const modes = computed(function () {
  return (db.CAPTURE_MODES || []).filter(function (m) {
    return m.on !== false && m.k !== 'money'
  })
})

/* 打开就聚焦。先放掉再拿起：不做出 false → true 的跳变，
   面板第二次打开时光标不会进来（focus 一直是 true）。 */
watch(() => db.CAP_OPEN, function (v) {
  if (!v) return
  focused.value = false
  nextTick(function () { focused.value = true })
})

function close() {
  closeCapture()
}

function toggleAutoClose() {
  db.CAP_AUTO_CLOSE = !db.CAP_AUTO_CLOSE
}

function setKind(k) {
  if (db.CAPTURE_KIND === k) return
  db.CAPTURE_KIND = k
  /* 两种模式的输入不是一回事（一个是一句话，一个是金额）。
     带过去只会让人提交一个自己没检查过的数。 */
  draft.value = ''
  amount.value = ''
  picked.value = ''
  refocus()
}

function refocus() {
  focused.value = false
  nextTick(function () { focused.value = true })
}

function submit() {
  if (kind.value === 'money') { submitMoney(); return }
  submitQuick()
}

function submitMoney() {
  if (!picked.value) {
    uni.showToast({ title: '先选个品类', icon: 'none' })
    return
  }
  const v = Number(amount.value)
  if (!v || v <= 0) {
    uni.showToast({ title: '填个金额', icon: 'none' })
    return
  }
  addMoney(v, picked.value, picked.value)
  const msg = '记下 ' + money(v) + ' · ' + picked.value
  picked.value = ''
  amount.value = ''
  done(msg)
}

function submitQuick() {
  const t = draft.value.trim()
  if (!t) return
  /* 这一轮仍是最简规则：数字在开头 → 支出，否则 → 待办。
     完整的规则表（关键词 / 正则 / 你自己写的那几条）下一轮搬。 */
  const m = /^\s*[¥￥]?\s*(\d+(?:\.\d+)?)/.exec(t)
  if (m) {
    const c = guessCategory(t)
    addMoney(Number(m[1]), t, c)
    done('记下 ' + money(Number(m[1])) + (c ? ' · ' + c : ''))
  } else {
    addTodo(t, '')
    done('记成待办')
  }
  draft.value = ''
}

/* 提交完的收尾。按那个开关决定收不收面板；
   收起来时顺便把模式归回「记一笔」—— 下次点加号是重新开始，
   不该莫名其妙停在上次那个模式上。 */
function done(msg) {
  uni.showToast({ title: msg, icon: 'none' })
  if (db.CAP_AUTO_CLOSE) {
    closeCapture()
    db.CAPTURE_KIND = 'quick'
  } else {
    refocus()
  }
}
</script>

<style scoped>
.capwrap {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 70;
}
.capmask {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--mask);
}
.capbox {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  padding: 10px 14px calc(14px + env(safe-area-inset-bottom));
  background: var(--card);
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -6px 24px rgba(31, 36, 48, .18);
  animation: capup .18s ease-out;
}
@keyframes capup {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.caphead {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  padding-bottom: 6px;
}
.autoclose {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 2px 0 2px 8px;
}
.autoclose-t { margin-right: 7px; font-size: 11px; color: var(--muted); }
.sw {
  position: relative;
  width: 36px;
  height: 21px;
  border-radius: 11px;
  background: var(--line2);
}
.sw.is-on { background: var(--accent); }
.sw-dot {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #fff;
}
.sw.is-on .sw-dot { left: 18px; }

.capin {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.capin-first { margin-top: 2px; }

.modes {
  width: 100%;
  margin-top: 10px;
  white-space: nowrap;
}

.cats {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  padding: 2px 0 4px;
}
.cats .mchip { margin: 5px 8px 0 0; }

.mchip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 14px;
  margin-right: 8px;
  border-radius: 15px;
  background: var(--bg);
}
.mchip-t { font-size: 12px; color: var(--sub); }
.mchip.is-on { background: var(--accent); }
.mchip.is-on .mchip-t { color: #fff; }

.kindsw {
  display: flex;
  flex-direction: row;
  padding: 3px;
  margin: 12px 0 10px;
  background: var(--bg);
  border-radius: 10px;
}
.kindsw-b {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border-radius: 8px;
}
.kindsw-t { font-size: 13px; color: var(--sub); }
.kindsw-b.is-on { background: var(--card); }
.kindsw-b.is-on .kindsw-t { color: var(--text); font-weight: 500; }

.capgo {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  background: var(--accent);
  border-radius: 10px;
}
.capgo-t { color: #fff; font-size: 15px; font-weight: 500; }
.capgo:active { background: #2A63D2; }
</style>
