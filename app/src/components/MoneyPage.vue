<template>
  <!-- 记账录入页：**整页浮层**，不是底栏里的一格。
       为什么是浮层而不是 pages 里的一个新页面：这一页要盖住底栏
       （截图里它没有底栏，四格加上那颗加号会把键盘挤上去），
       而「盖住底栏」这件事项目里已有现成做法 —— 和 CaptureSheet 同一个形状。
       它也不进 pages/index.vue 那 9 个视图：那些是 v-show 切来切去的同级页面，
       这一页是「从哪儿进来、返回就回哪儿」的临时态。 -->
  <view v-if="db.PAY_OPEN" class="paywrap" :class="'is-' + dir">
    <!-- 顶栏：返回 / 支出·收入 / 看账本 -->
    <view class="paytop">
      <view class="tbtn" @click="close">
        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 4.5 7.5 12 15 19.5" />
        </svg>
      </view>

      <!-- 只有支出 / 收入两格。截图里还有「转账」，但转账要有账户体系
           （转出账户 → 转入账户），数据里一个字都没有 —— 放一个点了没反应的
           tab，比不放更糟（仓库里「不许显示假交互」是硬规矩）。 -->
      <view class="dseg">
        <view class="dseg-b" :class="{ 'is-on': dir === 'out' }" @click="setDir('out')">
          <text class="dseg-t">支出</text>
        </view>
        <view class="dseg-b" :class="{ 'is-on': dir === 'in' }" @click="setDir('in')">
          <text class="dseg-t">收入</text>
        </view>
      </view>

      <view class="tbtn" @click="toLedger">
        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4.5 5.2A1.7 1.7 0 0 1 6.2 3.5h12.3v17H6.2a1.7 1.7 0 0 1-1.7-1.7z" />
          <path d="M8 3.5v17M11.5 7.5h4M11.5 11h4" />
        </svg>
      </view>
    </view>

    <!-- 分类网格。图标按名字取（CatIcon 里那张表），认不出的落兜底标签 ——
         所以用户自己新建的品类也有图标，不会出现空白格。 -->
    <view class="grid">
      <view v-if="!cats.length" class="gempty">
        <text class="gempty-t">还没有品类。点「分类设置」加一个。</text>
      </view>

      <view
        v-for="c in cats"
        :key="c"
        class="cell"
        :class="{ 'is-on': picked === c }"
        @click="pick(c)"
      >
        <view class="cell-ic"><CatIcon :name="c" :size="24" /></view>
        <text class="cell-t">{{ c }}</text>
      </view>

      <!-- 「分类设置」是网格里的一格（照截图）。它不是一个分类，
           所以不受选中态影响，也不参与 catList 的顺序。 -->
      <view class="cell cell-set" @click="catOpen = true">
        <view class="cell-ic"><CatIcon name="__gear__" :size="24" /></view>
        <text class="cell-t">分类设置</text>
      </view>
    </view>

    <!-- 下半屏钉死：金额卡 + 自绘键盘。不聚焦任何 input，
         所以不会冒出系统键盘把键盘区顶掉一半。 -->
    <view class="foot">
      <view class="amt">
        <view class="amt-l">
          <view class="amt-ic"><CatIcon :name="picked || '未分类'" :size="20" /></view>
          <view class="amt-tx">
            <text class="amt-k">{{ picked || '还没选分类' }}</text>
            <!-- 备注是**真实字段**（LOGS 的可选 note）。不用 input 的 placeholder
                 当门面 —— 点了要真的能打字、真的存下去。 -->
            <input :maxlength="-1"
              v-model="note"
              class="amt-note"
              placeholder="评论备注"
              confirm-type="done"
            />
          </view>
        </view>

        <view class="amt-r">
          <text class="amt-v">{{ amountText }}</text>
          <picker mode="date" :value="date" @change="onDate">
            <view class="amt-date">
              <svg class="ic ic-cal" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4.2 6.6h15.6v12.2H4.2z" />
                <path d="M4.2 10.4h15.6M8.4 4.4v4.2M15.6 4.4v4.2" />
              </svg>
              <text class="amt-date-t">{{ dateLabel }}</text>
            </view>
          </picker>
        </view>
      </view>

      <!-- 自绘键盘：1-9 / . 0 ⌫ 三列，右边一列是运算和提交。
           为什么自己做键盘：记账时手指本来就停在右下角，弹系统键盘要等一帧、
           而且它一起来会把分类网格挡掉 —— 对着网格挑分类是这一页的主要动作。
           `+` `−` 是**真的会算**（32+6 记 38），不是装饰：连着记几笔小额
           （外卖 + 配送费）时不用先自己算。 -->
      <view class="keys">
        <template v-for="r in ROWS" :key="r.join('_')">
          <view
            v-for="k in r"
            :key="k.k"
            class="k"
            :class="{ 'is-act': k.kind === 'act', 'is-done': k.kind === 'done', 'is-plain': k.kind === 'plain' }"
            @click="tap(k)"
          >
            <text class="k-t">{{ k.t }}</text>
          </view>
        </template>
      </view>
    </view>

    <!-- 品类管理复用记账页那个弹层，只是多了个方向。
         支出 / 收入是两份清单，所以必须把 dir 带下去。 -->
    <CatSheet :on="catOpen" :dir="dir" @close="catOpen = false" />
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { db, TODAY, money, fmtCN, catList, addMoney, closePay, go, saveState } from '../stores/db'
import CatIcon from './CatIcon.vue'
import CatSheet from './CatSheet.vue'
import { toast } from '../lib/ui'

/* 方向跟着 db 走（不是本地 ref）：底栏那个加号面板点「记账」时
   要把方向一起带进来（openPay('out')），本地 ref 接不住那个入参。 */
const dir = computed(function () { return db.PAY_DIR === 'in' ? 'in' : 'out' })

const cats = computed(function () { return catList(dir.value) })

const picked = ref('')
/* 金额存的是**算式**（'32+6'），提交时才求值 —— 「保存再记」连着记几笔时
   能看着自己按了什么，而不是只看到一个跳动的结果数。 */
const amount = ref('')
const note = ref('')
const date = ref(TODAY)
const catOpen = ref(false)

/* 展示：空 → ¥0；有算式 → 原样显示（带 ¥）。 */
const amountText = computed(function () {
  const a = amount.value
  return a ? ('¥' + a) : '¥0'
})

const dateLabel = computed(function () {
  return date.value === TODAY ? '今天' : fmtCN(date.value)
})

/* 键盘的四行。`.` 和 `⌫` 和数字同一档；右边那列是 ＋ / − / 保存再记 / 完成。 */
const ROWS = [
  [{ k: '1', t: '1' }, { k: '2', t: '2' }, { k: '3', t: '3' }, { k: '+', t: '＋', kind: 'act' }],
  [{ k: '4', t: '4' }, { k: '5', t: '5' }, { k: '6', t: '6' }, { k: '-', t: '−', kind: 'act' }],
  [{ k: '7', t: '7' }, { k: '8', t: '8' }, { k: '9', t: '9' }, { k: 'save', t: '保存再记', kind: 'plain' }],
  [{ k: '.', t: '.' }, { k: '0', t: '0' }, { k: 'del', t: '⌫' }, { k: 'done', t: '完成', kind: 'done' }]
]

function tap(k) {
  if (k.k === 'del') { amount.value = amount.value.slice(0, -1); return }
  if (k.k === 'save') { commit(true); return }
  if (k.k === 'done') { commit(false); return }
  /* 一个数里只允许一个小数点 */
  if (k.k === '.' && amount.value.indexOf('.') >= 0) return
  if (amount.value.length >= 12) return
  amount.value += k.k
}

/* 求值。**不用 eval / new Function** —— 输入虽然是用户自己按出来的，
   但这个项目的底线做法就是「不把字符串当代码跑」（见 riskyRegex：正则都只敢拒存）。
   只认 `数字 (+|-) 数字 …`，别的字符一律判非法。 */
function evalAmount(expr) {
  const s = String(expr || '').trim()
  if (!s) return null
  let total = 0, sign = 1, num = '', seen = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '+' || ch === '-') {
      if (num !== '') { total += sign * Number(num); num = ''; seen = true }
      sign = ch === '-' ? -1 : 1
      continue
    }
    if (ch === '.') {
      if (num.indexOf('.') >= 0) return null
      num += ch
      continue
    }
    if (ch >= '0' && ch <= '9') { num += ch; continue }
    return null
  }
  if (num !== '') { total += sign * Number(num); seen = true }
  if (!seen) return null
  return Math.round(total * 100) / 100
}

function commit(again) {
  if (!picked.value) { toast('先选个分类'); return }
  const v = evalAmount(amount.value)
  if (!(v > 0)) { toast('按个金额'); return }
  /* 写入口只有 addMoney 一处 —— 记一笔流水、进「今天记下的」、月度合计
     三处同时更新，都是它里面做的事。这里不许直接 push db.LOGS。 */
  addMoney(v, '', picked.value, dir.value, note.value)
  saveState(true)
  const msg = '记下 ' + money(v) + ' · ' + picked.value
  if (again) {
    /* 「保存再记」保留方向、分类和日期，只清金额和备注 ——
       连着记几笔同类（一顿饭分两次付）时不用每次重挑分类。
       「完成」把整页收掉，「保存再记」留在原地。 */
    amount.value = ''
    note.value = ''
    toast(msg)
    return
  }
  closePay()
  toast(msg)
}

function pick(c) {
  picked.value = c
}

function setDir(d) {
  if (db.PAY_DIR === d) return
  db.PAY_DIR = d
  /* 换方向必须把分类**清掉**，不能留着：支出的「餐饮」在收入那份清单里不存在，
     留着就能把一笔收入记到「餐饮」上 —— 那种错在界面上看不出来。 */
  picked.value = ''
  catOpen.value = false
}

function onDate(e) {
  date.value = e.detail.value || TODAY
}

function close() {
  /* 返回不弹「要丢弃吗」。这一页没有需要保护的长草稿 ——
     金额是按几下键的事，重按比每次返回都确认一遍快；
     真要保存，「完成」就在右下角那颗。 */
  closePay()
}

function toLedger() {
  closePay()
  go('ledger')
}

/* 每次打开都从头开始：分类空着（必选、不预选，和记账原来的规矩一致）、
   金额和备注清空、日期回到今天。
   日期**不记住上次那个** —— 补记上周的一笔之后忘了改回来，
   下次记今天就会落到上周，那种错在流水里才看得出来。 */
watch(() => db.PAY_OPEN, function (v) {
  if (!v) return
  picked.value = ''
  amount.value = ''
  note.value = ''
  date.value = TODAY
  catOpen.value = false
})
</script>

<style scoped>
/* 整页。宽度守手机宽度（fixed 元素不跟着 .sp-root 的 max-width 走）——
   在电脑浏览器里打开时，它不该被拉成一整条。 */
.paywrap {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  /* 底栏是 30、捕获面板是 70、通用弹窗是 80 —— 夹在中间：
     从面板点「记账」时面板已经先收了，但 CatSheet 要能盖在这一页上面。 */
  z-index: 75;
  max-width: var(--app-w, 430px);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  /* 键盘区不许被挤出去，所以整页不滚，滚的只有中间的分类网格 */
  overflow: hidden;
}

/* ---- 顶栏 ---- */
.paytop {
  flex: none;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 8px 6px 6px;
}
.tbtn {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  color: var(--text);
}
.tbtn:active { background: var(--line); }
.ic { width: 22px; height: 22px; }

/* 支出 / 收入两格。画法照 `base.scss` 的 `.seg`，但选中色要跟着方向走、
   不能用全局 accent，所以这一份留在本组件里（scoped 特异性高于全局）。 */
.dseg {
  /* 定宽 + flex:none，不靠 flex-grow —— 靠 grow 撑到 max-width 之后
     两端 auto 外边距分到的是「剩下的」空白，居中不稳（试过，偏左）。
     定宽之后 44 + auto + 176 + auto + 44 必然平分左右，居中是可算的。 */
  flex: none;
  width: 176px;
  display: flex;
  flex-direction: row;
  align-self: center;
  /* 左右 auto 把它压在两个 44px 图标钮的正中间 ——
     不加的话它贴着返回箭头，看着像「返回」的一部分。 */
  margin: 0 auto;
  padding: 3px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.dseg-b {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  border-radius: 8px;
}
.dseg-t { font-size: 13px; color: var(--sub); }
.is-out .dseg-b.is-on { background: var(--danger); }
.is-in .dseg-b.is-on { background: var(--ok); }
.is-out .dseg-b.is-on .dseg-t,
.is-in .dseg-b.is-on .dseg-t { color: #fff; font-weight: 500; }

/* ---- 分类网格 ---- */
.grid {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-content: flex-start;
  padding: 4px 10px 10px;
}
/* 一行 5 格（照截图）。用百分比宽度而不是 grid：uni-app 各端对 display:grid
   的支持不一致，flex + 百分比最稳。 */
.cell {
  width: 20%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 2px 8px;
}
.cell-ic {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--card);
  color: var(--sub);
}
.cell-t {
  margin-top: 3px;
  max-width: 100%;
  font-size: 11px;
  line-height: 1.3;
  color: var(--sub);
  text-align: center;
  /* 用户能建出很长的品类名。溢出就直接省略 —— 让它把格子撑宽的话，
     一行五格的整齐排列就散了，而那一排的整齐本身就是「一眼扫过去」的前提。 */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cell:active .cell-ic { background: var(--line); }

.is-out .cell.is-on .cell-ic {
  background: var(--danger-bg);
  border-color: var(--danger);
  color: var(--danger);
}
.is-in .cell.is-on .cell-ic {
  background: var(--ok-bg);
  border-color: var(--ok);
  color: var(--ok);
}
.is-out .cell.is-on .cell-t { color: var(--danger); font-weight: 500; }
.is-in .cell.is-on .cell-t { color: var(--ok); font-weight: 500; }

/* 「分类设置」那一格：虚线框，和「这是一类东西」的实心格区分开 */
.cell-set .cell-ic { border: 1px dashed var(--line2); background: transparent; }
.gempty {
  width: 100%;
  padding: 14px 4px;
}
.gempty-t { font-size: 13px; color: var(--muted); }

/* ---- 下半屏 ---- */
.foot {
  flex: none;
  padding: 0 10px calc(8px + env(safe-area-inset-bottom));
}

.amt {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.amt-l {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
}
.amt-ic {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--bg);
}
.is-out .amt-ic { color: var(--danger); }
.is-in .amt-ic { color: var(--ok); }
.amt-tx {
  flex: 1 1 auto;
  min-width: 0;
  margin-left: 9px;
}
.amt-k {
  display: block;
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* 备注输入框**没有框、没有底色**：它是这一行里的第二行字，
   加了边框就会和上面那个分类名抢注意力，而分类才是主信息。
   字号 16px 是硬要求（小于 16px 时 iOS 一聚焦就放大整页）。 */
.amt-note {
  display: block;
  width: 100%;
  height: 22px;
  min-height: 22px;
  padding: 0;
  margin-top: 1px;
  background: transparent;
  font-size: 16px;
  line-height: 22px;
  color: var(--text);
}
.amt-r {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: 8px;
}
/* 金额是这一页最大的一个字。颜色跟着方向走（支出红 / 收入绿）——
   中文记账的习惯，和股市那套红涨绿跌不是一回事：这里红=出去、绿=进来。 */
.amt-v {
  font-size: 24px;
  font-weight: 500;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.is-out .amt-v { color: var(--danger); }
.is-in .amt-v { color: var(--ok); }

.amt-date {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 3px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--bg);
  color: var(--sub);
}
.ic-cal { width: 13px; height: 13px; }
.amt-date-t { margin-left: 4px; font-size: 11px; color: var(--sub); }

/* ---- 键盘 ----
   4 列 4 行。数字键白底圆角；＋ − 和数字同一档（它们就是键盘的一部分）；
   「保存再记」是纯文字（它不是一次提交，是「提交后继续」）；
   「完成」是实心主色。 */
.keys {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}
.k {
  width: 25%;
  height: 50px;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 键帽画在内层（`.k-t`）而不是直接给 `.k` 上底色：点按的高亮要只亮键帽，
   连那 2px 间隙一起亮的话，四个键看着像糊成了一片。 */
.k-t {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 10px;
  background: var(--card);
  font-size: 20px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.k:active .k-t { background: var(--line); }
.k.is-act .k-t { font-size: 18px; color: var(--sub); }
.k.is-plain .k-t {
  background: transparent;
  font-size: 13px;
  color: var(--sub);
}
.k.is-plain:active .k-t { background: var(--line); }
.k.is-done .k-t {
  background: var(--accent);
  color: #fff;
  font-size: 15px;
  font-weight: 500;
}
.k.is-done:active .k-t { background: #2A63D2; }
</style>
