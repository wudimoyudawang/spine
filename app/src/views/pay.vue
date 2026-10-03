<template>
  <!-- 记一笔：**记账那一格的第二个镜头**，不是一个浮层。
       （2026-10-04 先做成了整页浮层，宇随后要求「记账默认进入记一笔，
       进入记一笔的时候保留『记账-记一笔』」—— 那个两格切换器要一直在，
       所以它必须是个和「记账」平级的正常页面，不是盖在上面的临时态。）
       浮层那版还有个副作用：顶栏只有返回箭头，两页之间没法互相看见。 -->
  <view class="page pay-page" :class="'is-' + dir">
    <PageHead title="记一笔" />

    <!-- 镜头：记账 / 记一笔。和「收集 / 随心记」用的是同一套（ViewSeg 的 group）。
         **两页上各有一颗、位置一样** —— 切过去的时候它不跳，才知道自己还在同一格底下。 -->
    <ViewSeg group="money" />

    <!-- 方向：支出 / 收入。
         它切的是**下面那一本分类清单**（两份清单各管各的），所以贴着网格放 ——
         放在页头的话，隔了半个屏幕，「它改了什么」要靠想。
         小一号 + 窄（和记账页那颗「支出/收入」同款）：它是这一页的第二层，
         不是和上面那颗镜头并列的东西。 -->
    <view class="seg blk-seg dirseg">
      <view
        v-for="d in PAY_DIRS"
        :key="d.k"
        class="seg-b"
        :class="{ 'is-on': dir === d.k }"
        @click="setDir(d.k)"
      >
        <text class="seg-t">{{ d.n }}</text>
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

    <!-- 金额卡 + 自绘键盘，钉在这一页的最下面。
         不聚焦任何 input，所以不会冒出系统键盘把键盘区顶掉一半。 -->
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
import { db, TODAY, money, fmtCN, catList, addMoney, go, saveState, PAY_DIRS } from '../stores/db'
import PageHead from '../components/PageHead.vue'
import ViewSeg from '../components/ViewSeg.vue'
import CatIcon from '../components/CatIcon.vue'
import CatSheet from '../components/CatSheet.vue'
import { toast } from '../lib/ui'

/* 方向跟着 db 走（不是本地 ref）：从外面进来时由 `openPay(dir)` 把它定下来，
   本地 ref 接不住那个入参。 */
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
       「完成」走人，「保存再记」留在原地。 */
    amount.value = ''
    note.value = ''
    toast(msg)
    return
  }
  /* 「完成」= 记下 + 去记账页。原来浮层那版是「关掉浮层」，现在没有「关掉」
     这回事了，所以给它一个自然的去处：记账页的最近流水里正好能看到刚记的这一笔，
     那比回到一个空键盘上更像「记完了」。 */
  go('ledger')
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

/* 每次**进来**都从头开始：分类空着（必选、不预选，和记账原来的规矩一致）、
   金额和备注清空、日期回到今天。
   日期**不记住上次那个** —— 补记上周的一笔之后忘了改回来，
   下次记今天就会落到上周，那种错在流水里才看得出来。

   **方向不在这里重置**（它归 `openPay(dir)` 管）：从底栏/今日页/空间页进来时
   归零成「支出」，而在「记账」和「记一笔」两个镜头之间来回切时保持不动 ——
   后者是同一格底下的切换，每次都被按回「支出」等于跟人作对。 */
watch(() => db.CURRENT, function (v) {
  if (v !== 'pay') return
  picked.value = ''
  amount.value = ''
  note.value = ''
  date.value = TODAY
  catOpen.value = false
})
</script>

<style scoped>
/* 这一页要**撑满一屏、把键盘钉在最下面** —— 键盘页的键必须在拇指够得着的地方，
   不能跟着内容往上飘（内容矮的时候，键浮在半空看着就坏了）。
   高度用 100vh 减掉底栏：底栏是 fixed 的，不参与文档流。 */
.pay-page {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--tabbar-h, 54px) - env(safe-area-inset-bottom));
  /* 底栏 + 一点点缝。`.page` 那份 76px 是给「行尾按钮别被浮起来的加号压住」留的，
     这一页最后一行是键盘，不需要那 22px 余量。 */
  padding-bottom: calc(var(--tabbar-h, 54px) + 6px + env(safe-area-inset-bottom));
}

/* 方向那颗：窄的，贴着网格左对齐。 */
.dirseg {
  flex: none;
  width: 148px;
  margin: 0 0 8px;
}
/* 支出红、收入绿（和金额数字、选中的分类格同一套）。
   只在这一页里覆盖 `.seg-b.is-on` 那颗蓝的。 */
.is-out .dirseg .seg-b.is-on { background: var(--danger); }
.is-in .dirseg .seg-b.is-on { background: var(--ok); }

/* ---- 分类网格 ---- */
.grid {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-content: flex-start;
  margin: 0 -4px;
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

/* ---- 金额卡 + 键盘 ---- */
.foot { flex: none; }

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
.ic { width: 22px; height: 22px; }
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
