<template>
  <view class="page">
    <PageHead title="空间" />

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

      <view v-if="!adding" class="card card-add" @click="startAdd">
        <view class="card-add-h">
          <PlusIcon :size="13" />
          <text class="card-t card-add-t">新建领域</text>
        </view>
        <text class="card-s">考证 / 育儿 / 副业 …</text>
      </view>
      <!-- 就地起个名字。不给个框的话，建出来的领域全叫「领域 5」，
           还得点进去改名 —— 两步能并成一步。 -->
      <view v-else class="card card-adding">
        <text class="card-t">这个领域叫什么</text>
        <input :maxlength="-1" v-model="newName" class="tin tin-in" placeholder="比如「考证」" placeholder-class="tph" />
        <view class="chips">
          <view class="btn btn-main" @click="createDomain"><text class="btn-t btn-main-t">创建</text></view>
          <view class="btn" @click="adding = false"><text class="btn-t">取消</text></view>
        </view>
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
        <text class="tag">记一笔</text>
        <text class="block-note">首页速记</text>
      </view>
      <view class="srow">
        <text class="srow-k">记完自动关</text>
        <view class="sw" :class="{ 'is-on': db.CAP_AUTO_CLOSE }" @click="db.CAP_AUTO_CLOSE = !db.CAP_AUTO_CLOSE">
          <view class="sw-dot"></view>
        </view>
      </view>
      <!-- 「快记类目」那一截删掉了：它是一份**只读**的清单，
           只显示哪些类目开着，本身一个都改不了 —— 能改的地方在记一笔面板的「自定义」里。
           摆一份改不了的状态在这里，等于让人跑来这儿找开关然后扑个空。 -->
      <view class="note"><text class="note-t">那排类目在面板上点「自定义」就能调顺序和开关；判断一句话靠的是规则，在下面那块。</text></view>
    </view>

    <!-- ============ 自动判断规则 ============
         放在设置页而不是记一笔的面板里：面板要矮到能让出输入法，
         而规则是偶尔配一次的东西 —— 挤进那几行只会两头都难受。 -->
    <view class="block">
      <view class="block-h">
        <text class="tag">自动判断规则</text>
        <text class="block-note">生效 {{ rstat.on }} / 共 {{ rstat.total }} 条</text>
      </view>

      <view v-for="(ru, i) in db.AUTO_RULES" :key="ru.id" class="rule" :class="{ 'is-off': !ru.on }">
        <view class="rule-h">
          <view class="sw sw-rule" :class="{ 'is-on': ru.on }" @click="flip(ru)">
            <view class="sw-dot"></view>
          </view>
          <view class="rule-n">
            <text class="rule-t">{{ ruleName(ru) }}</text>
            <text v-if="ru.sys" class="rule-sys">内置</text>
          </view>
          <text class="rule-to">{{ ruleTargetLabel(ru.to) }}</text>
        </view>
        <text class="rule-m">{{ ruleMatchLabel(ru) }}</text>
        <view class="rule-ops">
          <view class="mini" :class="{ 'is-dim': i === 0 }" @click="shift(ru, -1)"><text class="mini-t">上移</text></view>
          <view class="mini" :class="{ 'is-dim': i === db.AUTO_RULES.length - 1 }" @click="shift(ru, 1)">
            <text class="mini-t">下移</text>
          </view>
          <view class="mini" @click="editRule(ru.id)"><text class="mini-t">{{ editing === ru.id ? '收起' : '改' }}</text></view>
          <view v-if="!ru.sys" class="mini mini-del" @click="delRule(ru)">
            <text class="mini-t">{{ delArmed === 'rule:' + ru.id ? '确认删' : '删' }}</text>
          </view>
        </view>
        <RuleForm
          v-if="editing === ru.id"
          :key="ru.id"
          :rule="ru"
          @save="saveRuleFrom"
          @cancel="cancelRule"
        />
      </view>

      <view class="btn btn-add" @click="editRule('new')">
        <PlusIcon v-if="editing !== 'new'" :size="14" />
        <text class="btn-t">{{ editing === 'new' ? '收起' : '新增规则' }}</text>
      </view>
      <RuleForm v-if="editing === 'new'" :key="'new'" @save="saveRuleFrom" @cancel="cancelRule" />

      <view class="note">
        <text class="note-t">规则从上往下匹配，取第一条命中的。</text>
        <text class="note-t">你写的几条排在内置前面，挪不出这一组。</text>
        <text class="note-t">排除式写错了会被忽略，整条规则还在。</text>
        <text class="note-t">写完到下面的「试一句」里过一遍。</text>
      </view>
    </view>

    <!-- 这一框什么都不写进数据：它只是把上面那张表走一遍给人看。 -->
    <view class="block">
      <view class="block-h">
        <text class="tag">试一句</text>
        <text class="block-note">不会真的记下来</text>
      </view>
      <input :maxlength="-1"
        v-model="testText"
        class="tin"
        placeholder="1800 kcal ／ 深蹲 80kg × 5 × 5 ／ 32 午餐"
        placeholder-class="tph"
      />
      <template v-if="test">
        <view class="tres">
          <text class="tres-k">会记成 </text>
          <text class="tres-v">{{ test.describe }}</text>
        </view>
        <text class="tres-why" :class="{ 'is-bad': !test.hit }">
          {{ test.hit ? '命中「' + test.hit + '」' : '没有规则命中 · 会进收件箱' }}
        </text>
        <text class="tsub">逐条检查，顺序就是上面的顺序</text>
        <view v-for="row in test.rows" :key="row.n" class="trow">
          <text class="trow-t" :class="{ 'is-hit': row.hit }">{{ row.n }}. {{ row.name }}</text>
          <text class="trow-v" :class="{ 'is-hit': row.hit }">{{ row.hit ? '命中' : '不命中' }}{{ row.why }}</text>
        </view>
      </template>
      <view v-else class="note">
        <text class="note-t">上面随便打一句。</text>
        <text class="note-t">看不见它命中哪条，就等于没写对。</text>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">四象限配色</text>
        <view class="block-acts">
          <view class="mini" @click="resetQuad"><text class="mini-t">恢复默认</text></view>
        </view>
      </view>
      <view class="note">
        <text class="note-t">这四个颜色在四象限页、待办行左边的色条、编辑弹窗里是同一份。</text>
      </view>
      <view v-for="q in QUAD_ROWS" :key="q.k" class="qcrow">
        <view class="qcr-h">
          <view class="qcr-dot" :style="{ background: quadColorOf(q.k) }"></view>
          <text class="qcr-n">{{ q.n }}</text>
        </view>
        <view class="qcswatches">
          <view
            v-for="s in SWATCHES"
            :key="s"
            class="qcsw"
            :class="{ 'is-on': quadColorOf(q.k) === s }"
            :style="{ background: s }"
            @click="pickQuad(q.k, s)"
          ></view>
        </view>
      </view>
      <view class="note">
        <text class="note-t">点一个色块就换。「都不」那一格建议给灰的 —— 它是「没标过 / 不用管」的那格，太显眼会让人以为也值得看。</text>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">数据</text>
        <text class="block-note">都在本机</text>
      </view>
      <!-- 「本机存储：已自动保存」那行撤了 —— 存储状态现在常驻在每一页的页头，
           这里再摆一份是重复。存失败时这里留一句解释，页头那行只有四个字说不清。 -->
      <view v-if="storeFailed" class="note">
        <text class="note-t">这台设备现在存不了：刚记的只在这块屏幕上，换页或关掉就没有了。试着清一点存储空间再打开。</text>
      </view>
      <view class="chips">
        <view class="btn btn-main" @click="saveFile"><text class="btn-t btn-main-t">存成文件</text></view>
        <view class="btn" @click="copyAll"><text class="btn-t">复制到剪贴板</text></view>
      </view>
      <view class="chips chips-io">
        <view class="btn" @click="pickFile"><text class="btn-t">从文件导入</text></view>
        <view class="btn" @click="readClip"><text class="btn-t">读剪贴板</text></view>
      </view>

      <!-- 待导入那份的摘要。一坨 8KB 的 JSON 摆在眼前，
           谁也看不出这份档案里到底有多少东西 —— 换成数得清的几行。 -->
      <view v-if="pending" class="imp">
        <view class="imp-h">
          <text class="imp-t">这份档案</text>
          <text class="imp-at">{{ pending.when }}</text>
        </view>
        <text class="imp-row">{{ pending.line }}</text>
        <text class="imp-row imp-row2">本机现在是：{{ localLine }}</text>
        <text class="imp-warn">导入会把本机换成这一份。</text>
        <view class="chips">
          <view class="btn" @click="cancelImport"><text class="btn-t">取消</text></view>
          <view class="btn btn-main" @click="doImport"><text class="btn-t btn-main-t">覆盖导入</text></view>
        </view>
      </view>
      <view v-else class="note">
        <text class="note-t">存成文件带走，换手机用它还原。</text>
      </view>
    </view>

    <view class="block">
      <view class="block-h">
        <text class="tag">自动备份</text>
        <text class="block-note">每天一份 · 留最近 {{ backups.length }} 份</text>
      </view>
      <view v-if="!backups.length" class="note">
        <text class="note-t">还没有备份。今天记下第一笔之后就会有一份，不用管它。</text>
      </view>
      <view v-for="b in backups" :key="b.date" class="srow">
        <view class="bk-main">
          <text class="srow-k">{{ bkLabel(b) }}</text>
          <text class="bk-sub">{{ countLine(b.counts) }}</text>
        </view>
        <view class="mini" :class="{ 'mini-del': bkArmedFor(b.date) }" @click="restoreGo(b)">
          <text class="mini-t" :class="{ 'is-danger': bkArmedFor(b.date) }">{{ bkArmedFor(b.date) ? '确认恢复' : '恢复到这天' }}</text>
        </view>
      </view>
      <view class="note">
        <text class="note-t">每天第一次记东西时自动留一份，留最近 7 份，清空数据也不清它们。</text>
        <text class="note-t">恢复会把本机换成那天的样子 —— 恢复前会先把现在这份也留成备份，所以恢复是可反悔的。</text>
      </view>
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

    <!-- 清空数据放在设置的最底下，和上面的导出/导入隔了三块 ——
         离得远不是随手排的：这一颗按下去清的是全部。
         两段确认和别处的删除是同一个思路，但这里文案直接写清后果，
         不用「再点一次」这种不含信息量的提示。 -->
    <view class="block block-danger">
      <view class="block-h">
        <text class="tag">清空数据</text>
        <text class="block-note">清掉全部，回到空白</text>
      </view>
      <view class="note">
        <text class="note-t">清掉所有的待办、习惯、计划、记账、随心记、收集箱和领域，四象限配色也回到默认。</text>
        <text class="note-t">清掉就找不回来了 —— 想留一份的话，先去上面的「数据」里存成文件。</text>
      </view>
      <view class="chips">
        <view class="btn" :class="{ 'btn-danger': clearArmed }" @click="clearGo">
          <text class="btn-t" :class="{ 'btn-danger-t': clearArmed }">{{ clearArmed ? '再点一次，确认清空全部' : '清空全部数据' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  db, go, money, TODAY, pad2, summaryOf, recordTypesOf, togglePin, newDomain,
  monthMoney,
  storeFailed, importSnapshot, saveState, clearAllData,
  exportText, exportFileName, peekArchive, localCounts,
  backupList, restoreBackup,
  ruleName, ruleTargetLabel, ruleMatchLabel, ruleStats, ruleMatches, whyNot,
  toggleRule, moveRule, saveRule, armConfirm, delArmed, disarmDelete,
  quadColorOf, setQuadColor, QUAD_COLOR_DEFAULT,
  resolveCapture, describeCapture
} from '../stores/db'
import PageHead from '../components/PageHead.vue'
import PlusIcon from '../components/PlusIcon.vue'
import RuleForm from '../components/RuleForm.vue'
import { toast, confirmDelete } from '../lib/ui'

function summary(d) {
  return summaryOf(d, recordTypesOf(db.RECORD_TYPES, d.id).length)
}

const moneySummary = computed(function () {
  /* 和今日页的「本月」、记账页的合计读的是同一处（db.monthMoney）——
     各自 filter+reduce 一遍的话，改口径时只会改到一处 */
  const mm = monthMoney(TODAY.slice(0, 7))
  return '本月 ' + money(mm.sum) + ' · ' + mm.count + ' 笔'
})

function pin(d) {
  const on = togglePin(d.id)
  toast(on ? '已加到顶部快捷' : '已取消顶部快捷')
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

/* ---------------- 新建领域 ---------------- */
const adding = ref(false)
const newName = ref('')

function startAdd() {
  adding.value = true
  newName.value = ''
}
function createDomain() {
  const r = newDomain(newName.value)
  if (r.error) { toast(r.error); return }
  adding.value = false
  saveState(true)
  /* 建完直接进那个领域：空领域里下一步就是加东西，
     把人留在卡片列表里等于让他再点一次自己刚建的那张。 */
  db.DOMAIN_ID = r.domain.id
  go('domain')
  toast('已创建「' + r.name + '」')
}

/* ---------------- 四象限配色 ----------------
 * 十二个候选色。不做「随便填一个 hex」的输入框：
 * 移动端上没有现成的取色器，自己拼一个输入框出来，输入的色到底长什么样要靠猜；
 * 给一排色块点一下就换，所见即所得。 */
const QUAD_ROWS = [
  { k: 'q1', n: '重要且紧急' },
  { k: 'q2', n: '重要不紧急' },
  { k: 'q3', n: '紧急不重要' },
  { k: 'q4', n: '都不' }
]
const SWATCHES = [
  '#D64545', '#E05252', '#C97B63', '#E08E2B', '#C9A227', '#A85B00',
  '#2F9E8F', '#3B7DD8', '#2F6FEB', '#7C5CC4', '#8A8F99', '#5A6272'
]

function pickQuad(k, hex) {
  const r = setQuadColor(k, hex)
  if (r.error) { toast(r.error); return }
  saveState(true)
}
function resetQuad() {
  for (const k of ['q1', 'q2', 'q3', 'q4']) setQuadColor(k, QUAD_COLOR_DEFAULT[k])
  saveState(true)
  toast('已恢复默认配色')
}

/* ---------------- 清空数据 ----------------
 * 两段确认，和别处的删除走**同一个**闸门（db.armConfirm / delArmed）：
 * 第一下只武装（变红、文案变成「确认清空」），第二下才真清；几秒不动自动回退。
 * 这一颗清掉的是**全部**数据，所以那颗钮要和上面的导出离得远一点。
 *
 * 原先这里自备了一个 armed ref 加一个定时器 —— 同一套手势三份实现，
 * 而且脱离了「全局同时只可能有一个待确认」这条保证。 */
const CLEAR_SPEC = 'action:clear-all'
const clearArmed = computed(function () { return delArmed.value === CLEAR_SPEC })

function clearGo() {
  const res = armConfirm(CLEAR_SPEC, function () {
    clearAllData()
    return { ok: true }
  })
  if (res === null) return            /* 只是武装起来了 */
  toast('已清空')
}

const armed = delArmed

/* ---------------- 自动备份 ----------------
 * 恢复是两段确认（和别处的删除同一个闸门），因为「恢复」覆盖的是全部。
 * backupList() 读的是存储不是响应式，所以用 bkTick 逼它重算 ——
 * 恢复完列表本身也变了（多出一份「恢复前」），不逼一次就是旧清单。 */
const bkTick = ref(0)
const backups = computed(function () {
  bkTick.value
  return backupList()
})
const bkSpec = function (date) { return 'action:restore:' + date }
function bkArmedFor(date) { return delArmed.value === bkSpec(date) }

function bkLabel(b) {
  if (b.date === TODAY) return '今天 · ' + b.date
  return b.date
}
function restoreGo(b) {
  const res = armConfirm(bkSpec(b.date), function () {
    const r = restoreBackup(b.date)
    if (r.error) return { error: r.error }
    bkTick.value++
    return { ok: true }
  })
  if (res === null) return            /* 只是武装起来了 */
  if (res.error) { toast(res.error); return }
  toast('已恢复到 ' + b.date)
}

/* ---------------- 导入 / 导出 ----------------
   两条通道都留着，但分工清楚：
   **文件**是主路（不占字符数、能长期存、换手机靠它），
   **剪贴板**是辅路（在微信里复制来一段、或者没有文件管理器的时候用）。 */

/* 摘下来的摘要，等人确认。null = 现在没有待导入的档案。 */
const pending = ref(null)

function countLine(c) {
  return c.domains + ' 个领域 · ' + c.items + ' 条待办 · ' + c.logs + ' 笔流水 · '
    + c.notes + ' 条随记 · ' + c.inbox + ' 条收件箱 · ' + c.records + ' 条记录'
}
/* 本机现在有多少。和待导入那份并排放 —— 不然看不出「导进去是变多还是变少」。
   它读的是 db 上的数组，导入换掉引用之后会自己重算。 */
const localLine = computed(function () { return countLine(localCounts()) })

function whenText(at) {
  if (!at) return '没写导出时间'
  const d = new Date(at)
  /* 用数据层的 pad2，不再就地再写一份等价实现（原来这里有个 p(n)） */
  return '导出于 ' + (d.getMonth() + 1) + '月' + d.getDate() + '日 '
    + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

/* 两条通道最后都汇到这里：**先给摘要，不上来就换**。 */
function takeArchive(raw, from) {
  const p = peekArchive(raw)
  if (p.error) { toast(p.error); return }
  pending.value = { raw: raw, when: whenText(p.at), line: countLine(p.counts) }
  toast(from + '读进来了，往下看一眼')
}

function cancelImport() { pending.value = null }

/* 存成文件。
   两种环境走两条路，都从这一个函数出去：
   1. **装进原生壳里**（Capacitor）—— 宿主会注入 `window.SPINE_SAVE_FILE`，
      由它写进 App 目录再调系统分享面板。WebView 里 `a[download]` 不生效，
      这条路是必须的。见 `shell/web-shim.js`。
   2. **浏览器里** —— Blob + `a[download]`。
   页面自己不判断环境，只认「有没有那个钩子」，所以它不会被某个壳绑死。
   钩子**返回 Promise**：壳那边注入的时候 `uni` 还没加载，它自己弹不出 app 风格的提示，
   所以失败的实情要传回这里、由这一层说 —— 否则只能掉回原生 alert。 */
function saveFile() {
  const name = exportFileName()
  const text = exportText()
  // #ifdef H5
  if (typeof window !== 'undefined' && typeof window.SPINE_SAVE_FILE === 'function') {
    /* 兜一层 Promise.resolve：壳要是旧版（不返回 Promise）也不会在这里炸 */
    Promise.resolve(window.SPINE_SAVE_FILE(name, text))
      .then(function () { toast('已导出，选个地方存') })
      .catch(function (e) { toast('导出失败：' + ((e && e.message) || e)) })
    return
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    /* 立刻 revoke 会把下载掐掉，等一拍再放 */
    setTimeout(function () { URL.revokeObjectURL(url) }, 4000)
    toast('已存成 ' + name)
  } catch (e) {
    toast('这个浏览器存不了文件，用剪贴板')
  }
  // #endif
  // #ifndef H5
  /* 官方的 DCloud 壳（HBuilderX 那条路）还没接：那边要 `plus.io` / `uni.saveFile`。
     装的是 Capacitor 壳的话走不到这里 —— 它用的是上面那个 H5 分支 +
     宿主注入的 SPINE_SAVE_FILE。 */
  toast('这个壳还没接存文件，先用剪贴板')
  // #endif
}

/* 从文件导入。H5 端 uni.chooseFile 就是原生 <input type="file">，没有体积上限。 */
function pickFile() {
  uni.chooseFile({
    count: 1,
    extension: ['json'],
    success: function (res) {
      const f = res.tempFiles && res.tempFiles[0]
      if (!f) { toast('没选到文件'); return }
      const rd = new FileReader()
      rd.onload = function () { takeArchive(String(rd.result || ''), '文件') }
      rd.onerror = function () { toast('这个文件读不出来') }
      rd.readAsText(f)
    },
    /* 用户自己点取消，不报错 */
    fail: function () {}
  })
}

function copyAll() {
  uni.setClipboardData({
    data: exportText(),
    success: function () { toast('已复制，贴到备忘录或发给自己') },
    fail: function () { toast('复制失败，试试存成文件') }
  })
}

function readClip() {
  uni.getClipboardData({
    success: function (res) {
      const v = String(res.data || '').trim()
      if (!v) { toast('剪贴板里是空的'); return }
      takeArchive(v, '剪贴板')
    },
    fail: function () { toast('读不到剪贴板，试试从文件导入') }
  })
}

function doImport() {
  if (!pending.value) return
  const err = importSnapshot(pending.value.raw)
  if (err) { toast(err); return }
  pending.value = null
  /* 导入换掉了全部数据：正在编辑的那张草稿表、武装待删的那颗按钮都不该留着 */
  disarmDelete()
  toast('已导入，本机数据已换成这份')
}

/* 存储状态常驻在每一页的页头（saveStateText），这里不再重复一份。
   失败时的解释留在上面那个 note 里 —— 页头只有四个字，说不清原因。 */

/* ---------------- 自动判断规则 ---------------- */
const rstat = computed(ruleStats)

/* 同一时刻只开一张草稿表：点开另一条就是把这张丢掉。
   留着两张的话，人会记不清刚才是改的哪一条。 */
const editing = ref('')

function editRule(id) {
  editing.value = editing.value === id ? '' : id
}
function cancelRule() { editing.value = '' }

function saveRuleFrom(rec) {
  const was = saveRule(rec)
  editing.value = ''
  toast(was === 'new' ? '规则已加上，排在最前面' : '规则已保存')
}

function flip(ru) { toggleRule(ru.id) }

function shift(ru, d) {
  if (moveRule(ru.id, d)) return
  /* 到边了，或者那一头是另一组 —— 两种都不许，但没必要分两句说 */
  toast('挪不动：到边或不能跨组')
}

/* 两段确认，和删一条待办同一套：第一下只是武装，4 秒内再点一下才算。
   第一下不发提示（按钮自己会变成「确认删」），保持原样。 */
function delRule(ru) {
  const r = confirmDelete('rule:' + ru.id)
  if (r.armed) return
  if (r.error) { toast(r.error); return }
  if (editing.value === ru.id) editing.value = ''
  toast('规则已删掉')
}

const testText = ref('')

/* 把整张表按顺序走一遍给人看。判断走的是 resolveCapture / ruleMatches 本尊，
   不是照着规则重写的一份「解释」—— 那份迟早和真的对不上。 */
const test = computed(function () {
  const v = testText.value.trim()
  if (!v) return null
  const r = resolveCapture(v, 'auto')
  const rows = db.AUTO_RULES.map(function (ru, i) {
    let hit = ruleMatches(ru, v)
    let why = ''
    if (hit) {
      why = whyNot(ru, v)
      if (why) hit = false
    }
    return { n: i + 1, name: ruleName(ru), hit: hit, why: why }
  })
  return { describe: describeCapture(r), hit: r.rule ? ruleName(r.rule) : '', rows: rows }
})
</script>

<style scoped>

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
/* 虚线卡里那行「加号 + 新建领域」。卡片本身是竖排的两行字，这一行要横排，包一层。
   间距用 :deep —— PlusIcon 是子组件，它的类名带的是**子组件**的 scope，
   父组件的普通选择器选不中它（这个坑在 scoped 样式里很常见）。 */
.card-add-h {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.card-add-h :deep(.pi) { margin-right: 5px; color: var(--sub); }
/* 就地起名字那张卡 */
.card-adding { grid-column: 1 / -1; }
.tin-in { margin-top: 8px; background: var(--bg); }

/* 导入那两颗按钮。和上一行分开一点 —— 上面两颗是「把数据拿出来」，
   这两颗是「把数据放进去」，方向相反，挤在一起容易点错。 */
.chips-io { padding-top: 8px; }

/* 待导入那份的摘要 */
.imp {
  margin-top: 12px;
  padding: 10px 12px 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.imp-h {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
}
.imp-t { font-size: 13px; font-weight: 500; color: var(--text); }
.imp-at { font-size: 11px; color: var(--muted); }
.imp-row {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text);
}
.imp-row2 { color: var(--muted); }
.imp-warn {
  display: block;
  margin-top: 7px;
  font-size: 12px;
  color: var(--warn);
}

.note { padding: 14px 2px 0; }
.note-t {
  display: block;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
}

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

.block-acts { display: flex; flex-direction: row; align-items: center; }
/* .addbtn 那三行搬到 styles/base.scss 了 —— 今日 / 领域 / 空间三页共用一份。 */

/* 四象限配色那一行：左边「色点 + 名字」，下面一排色块。
   色块 26px 见方 —— 这是设置页里唯一靠颜色本身说话的控件，
   做小了看不出它到底是不是那个色。选中的那颗描一圈边，不靠对勾图标。 */
.bk-main { flex: 1 1 auto; min-width: 0; }
.bk-sub { display: block; margin-top: 1px; font-size: 11px; color: var(--muted); }
.mini-t.is-danger { color: var(--danger); }
.qcrow { padding: 9px 0 3px; border-top: 1px solid var(--line); }
.qcr-h { display: flex; flex-direction: row; align-items: center; }
.qcr-dot { flex: none; width: 13px; height: 13px; margin-right: 7px; border-radius: 50%; }
.qcr-n { font-size: 13px; color: var(--text); }
.qcswatches { display: flex; flex-direction: row; flex-wrap: wrap; margin-top: 7px; }
.qcsw {
  width: 26px;
  height: 26px;
  margin: 0 7px 7px 0;
  border-radius: 7px;
  border: 1px solid rgba(31, 36, 48, .12);
}
.qcsw.is-on { border: 2px solid var(--text); }

/* 清空数据那块：整块描红边，不是只有那颗钮是红的。
   离得远 + 整块变红，两种信号一起说「这一块和上面那些不一样」。 */
.block-danger { border-color: var(--danger); }
.btn-danger-t { color: var(--danger); }

.chips { display: flex; flex-direction: row; padding-top: 10px; }
/* 一个块里的两颗按钮平分宽度：让「取消」比「创建」窄一半，
   看着像它不重要 */
.chips .btn { flex: 1 1 0; }
.chips .btn + .btn { margin-left: 8px; }
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--line2);
  border-radius: 10px;
}
/* 按钮里「图标 + 文字」之间的间距。只有带图标的那些按钮会命中 */
.btn :deep(.pi) { margin-right: 6px; }
.btn-t { font-size: 13px; color: var(--text); }
.btn-main { background: var(--accent); border-color: var(--accent); }
.btn-main-t { color: #fff; }
.btn:active { background: var(--bg); }

/* ---------------- 规则那一段 ---------------- */
.rule {
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.rule.is-off .rule-t,
.rule.is-off .rule-m { color: var(--muted); }

.rule-h {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
}
.rule-n {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
}
.rule-t { font-size: 13px; color: var(--text); }
.rule-sys {
  margin-left: 6px;
  padding: 0 5px;
  border: 1px solid var(--line2);
  border-radius: 999px;
  font-size: 10px;
  color: var(--muted);
}
.rule-to {
  flex: 0 1 auto;
  margin-left: 8px;
  text-align: right;
  font-size: 11px;
  color: var(--sub);
}
.rule-m {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--muted);
  word-break: break-all;
}
.rule-ops {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 7px;
}
/* 行里的开关比顶部那个小一号，不然它比字还高 */
.sw-rule {
  flex: 0 0 auto;
  width: 34px;
  height: 20px;
  margin-right: 9px;
  border-radius: 10px;
}
.sw-rule .sw-dot { top: 3px; left: 3px; width: 14px; height: 14px; }
.sw-rule.is-on .sw-dot { left: 17px; }

.mini {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 28px;
  margin-right: 6px;
  padding: 0 10px;
  border: 1px solid var(--line2);
  border-radius: 14px;
}
.mini-t { font-size: 11px; color: var(--sub); }
.mini:active { background: var(--accent-bg); border-color: var(--accent); }
.mini.is-dim { opacity: .35; }
/* 删除那颗：武装起来才变红，平时它和别的按钮一个样子 */
.mini-del:active { background: var(--danger-bg); border-color: var(--danger); }
.mini-del:active .mini-t { color: var(--danger); }

.btn-add {
  width: 100%;
  margin-top: 10px;
  border-style: dashed;
}

.tin {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 13px;
  color: var(--text);
  box-sizing: border-box;
}
.tph { color: var(--muted); }

.tres {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 10px;
}
.tres-k { font-size: 12px; color: var(--muted); }
.tres-v { font-size: 13px; font-weight: 500; color: var(--text); }
.tres-why {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--accent);
}
.tres-why.is-bad { color: var(--muted); }
.tsub {
  display: block;
  margin-top: 8px;
  font-size: 11px;
  color: var(--muted);
}
.trow {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding: 5px 0;
  border-top: 1px solid var(--line);
}
.trow-t { font-size: 12px; color: var(--muted); }
.trow-v { font-size: 11px; color: var(--muted); }
.trow-t.is-hit, .trow-v.is-hit { color: var(--accent); }
</style>
