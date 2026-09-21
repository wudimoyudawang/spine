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
        <view class="moderow">
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
          <!-- 固定在右侧：不跟着上面那排横滑滚走，永远在同一个位置 -->
          <view class="morebtn" :class="{ 'is-on': showAll }" @click="showAll = !showAll">
            <text class="morebtn-t">自定义</text>
          </view>
        </view>

        <!-- 展开的是「空间里所有能记的东西」。每行两个控制：
             左边的上下箭头管顺序（就是上面那排的真实次序），右边的开关管它进不进那排。
             关掉的仍然留在列表里、只是变淡 —— 否则关掉之后就再也找不回来了。 -->
        <scroll-view v-if="showAll" class="allbox" scroll-y>
          <view v-for="(o, i) in allOptions" :key="o.k" class="allrow" :class="{ 'is-off': !o.on }">
            <view class="arw">
              <view class="arw-b" :class="{ 'is-dim': !canUp(i) }" @click="move(o, -1)">
                <view class="tri tri-up"></view>
              </view>
              <view class="arw-b" :class="{ 'is-dim': !canDown(i) }" @click="move(o, 1)">
                <view class="tri tri-dn"></view>
              </view>
            </view>
            <view class="allrow-m" @click="pickOption(o)">
              <text class="allrow-t" :class="{ 'is-on': mode === o.k }">{{ o.t }}</text>
              <text class="allrow-s">{{ sub(o) }}</text>
            </view>
            <view class="sw sw-row" :class="{ 'is-on': o.on }" @click="toggle(o)">
              <view class="sw-dot"></view>
            </view>
          </view>
        </scroll-view>

        <!-- 挪乱了想回到初始样子，不用一个个点回去 -->
        <view v-if="showAll" class="allreset" @click="resetCfg">
          <text class="allreset-t">恢复默认</text>
        </view>
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
  db, TODAY, money, catList, guessCategory, closeCapture,
  addMoney, addTodo, addInbox, addRecord,
  allCaptureOptions, commonCaptureOptions, moveCaptureOption, toggleCaptureCommon,
  resetCaptureConfig, saveState
} from '../stores/db'

const draft = ref('')
const amount = ref('')
const picked = ref('')
const mode = ref('auto')
const focused = ref(false)

const kind = computed(function () { return db.CAPTURE_KIND })

const cats = computed(function () { return catList() })

const showAll = ref(false)

/* 上面那排横滑的 = 在自定义里开着的那几个。
   顺序也来自那儿：列表里怎么排，这一排就怎么排，中间不做映射。 */
const modes = computed(function () { return commonCaptureOptions() })

/* 「自定义」里展开的全部：空间里所有能记的东西 */
const allOptions = computed(function () { return allCaptureOptions() })

function sub(o) {
  if (o.builtin) return o.group
  return o.group + (o.unit ? ' · ' + o.unit : '')
}

/* 能不能往这个方向挪。锁住的不动，也不能越过锁住的 —— 「自动判断」占着第一位。 */
function canUp(i) {
  const L = allOptions.value
  return i > 0 && !L[i].lock && !L[i - 1].lock
}
function canDown(i) {
  const L = allOptions.value
  return i < L.length - 1 && !L[i].lock && !L[i + 1].lock
}

function move(o, d) {
  if (o.lock) { uni.showToast({ title: '「自动判断」固定在第一位', icon: 'none' }); return }
  if (!moveCaptureOption(o.k, d)) return
  /* 挪完立刻落盘，不等那个 2 秒的定时器 —— 人可能配完就切走 */
  saveState(true)
}

function toggle(o) {
  if (o.lock) { uni.showToast({ title: '「自动判断」是默认项，一直都在', icon: 'none' }); return }
  const on = toggleCaptureCommon(o.k)
  /* 关掉的正是当前选着的那个，就退回「自动判断」——
     不退的话，面板上会停在一个已经不在那排里的模式，看不出选中了什么。 */
  if (!on && mode.value === o.k) mode.value = 'auto'
  saveState(true)
}

function resetCfg() {
  resetCaptureConfig()
  if (mode.value !== 'auto' && !commonCaptureOptions().some(function (m) { return m.k === mode.value })) {
    mode.value = 'auto'
  }
  saveState(true)
  uni.showToast({ title: '回到默认', icon: 'none' })
}

function pickOption(o) {
  mode.value = o.k
  showAll.value = false
  refocus()
}

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
  const mv = mode.value

  /* 手动点名了某个记录项：这一行里的数字（或者整句）记到它上面。
     体重、热量、力量训练那些就是靠这条路记进去的。 */
  if (mv.indexOf('rt:') === 0) {
    const num = /-?\d+(?:\.\d+)?/.exec(t)
    addRecord(mv.slice(3), num ? Number(num[0]) : t)
    done('记下了')
    draft.value = ''
    return
  }
  if (mv === 'todo') { addTodo(t, ''); done('记成待办'); draft.value = ''; return }
  if (mv === 'inbox') { addInbox(t); done('丢进收件箱了'); draft.value = ''; return }
  if (mv === 'note') {
    db.NOTES.unshift({ id: 'nt' + Date.now().toString(36), d: TODAY, text: t })
    done('记进随心记了')
    draft.value = ''
    return
  }

  /* 自动判断。这一轮仍是最简规则：数字在开头 → 支出，否则 → 待办。
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
/* 面板居中，不贴底。贴底那版在手机上不好用：
   手要够到屏幕最下面，而输入法一起来，面板又被顶得只剩一半。
   宽度也守住手机宽度 —— 在电脑浏览器里打开时，它不该被拉成一整条。 */
.capbox {
  position: absolute;
  top: 50%;
  left: 50%;
  width: calc(100% - 32px);
  max-width: calc(var(--app-w, 430px) - 32px);
  transform: translate(-50%, -50%);
  padding: 12px 14px 14px;
  background: var(--card);
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(31, 36, 48, .22);
  max-height: 86vh;
  animation: capin .18s ease-out;
}
@keyframes capin {
  from { opacity: 0; transform: translate(-50%, -50%) scale(.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
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

.moderow {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 10px;
}
.modes {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
}
.morebtn {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 12px;
  margin-left: 8px;
  border: 1px solid var(--line2);
  border-radius: 15px;
}
.morebtn-t { font-size: 12px; color: var(--sub); }
.morebtn.is-on { border-color: var(--accent); }
.morebtn.is-on .morebtn-t { color: var(--accent); }

.allbox {
  /* 列表高了会让整个面板超出屏幕，所以给它一个上限、内部滚动。
     剩下那几样（输入框 / 切换器 / 记下）在矮屏上也必须留在视野里。 */
  max-height: 34vh;
  margin-top: 10px;
  padding: 2px 0;
  background: var(--bg);
  border-radius: 10px;
}
.allrow {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 5px 10px 5px 4px;
}
/* 关掉的变淡，但**不从列表里拿掉** —— 否则关掉之后就再也找不回来了 */
.allrow.is-off .allrow-t { color: var(--muted); }

/* 左边那对上下箭头：调的就是上面那排的真实次序 */
.arw {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 26px;
  margin-right: 2px;
}
.arw-b {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  border-radius: 5px;
}
.arw-b:active { background: var(--line); }
.arw-b.is-dim:active { background: transparent; }
/* 三角形用边框画，不用 ▲▼ 字符：字符的字形各机型不一致，会看着歪 */
.tri {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
}
.tri-up { border-bottom: 5px solid var(--sub); }
.tri-dn { border-top: 5px solid var(--sub); }
.arw-b.is-dim .tri { opacity: .25; }

.allrow-m {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 3px 10px 3px 2px;
}
.allrow-t { font-size: 13px; color: var(--text); }
.allrow-t.is-on { color: var(--accent); }
.allrow-s { font-size: 11px; color: var(--muted); }

/* 列表行里的开关比顶部那个小一号 */
.sw-row {
  flex: 0 0 auto;
  width: 34px;
  height: 20px;
  border-radius: 10px;
}
.sw-row .sw-dot { top: 3px; left: 3px; width: 14px; height: 14px; }
.sw-row.is-on .sw-dot { left: 17px; }

.allreset {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  margin-top: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.allreset-t { font-size: 12px; color: var(--sub); }
.allreset:active { background: var(--bg); }

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
