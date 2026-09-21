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

      <view v-if="!adding" class="card card-add" @click="startAdd">
        <text class="card-t card-add-t">+ 新建领域</text>
        <text class="card-s">考证 / 育儿 / 副业 …</text>
      </view>
      <!-- 就地起个名字。不给个框的话，建出来的领域全叫「领域 5」，
           还得点进去改名 —— 两步能并成一步。 -->
      <view v-else class="card card-adding">
        <text class="card-t">这个领域叫什么</text>
        <input v-model="newName" class="tin tin-in" placeholder="比如「考证」" placeholder-class="tph" />
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
        <text class="tag">快记类目</text>
        <text class="block-note">首页速记里出现的</text>
      </view>
      <view v-for="m in db.CAPTURE_MODES" :key="m.k" class="srow">
        <text class="srow-k">{{ m.t }}</text>
        <text class="srow-v">{{ m.on ? (m.lock ? '常开' : '开') : '关' }}</text>
      </view>
      <!-- 和面板右上角那个是同一个值：面板上那份是「记的时候就近改」，
           这里才是它的正式位置。 -->
      <view class="srow">
        <text class="srow-k">记完自动关</text>
        <view class="sw" :class="{ 'is-on': db.CAP_AUTO_CLOSE }" @click="db.CAP_AUTO_CLOSE = !db.CAP_AUTO_CLOSE">
          <view class="sw-dot"></view>
        </view>
      </view>
      <view class="note"><text class="note-t">这里只管首页那一排出现哪些类目。判断一句话靠的是规则，在下面那块。</text></view>
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
        <text class="btn-t">{{ editing === 'new' ? '收起' : '+ 新增规则' }}</text>
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
      <input
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
        <text class="tag">记账品类</text>
        <view class="block-acts">
          <text class="block-note">{{ db.CATS.length }} 个</text>
          <view class="addbtn" @click="newCat">
            <text class="addbtn-t">{{ catOn === 'new' ? '收起' : '新增' }}</text>
          </view>
        </view>
      </view>
      <view v-if="!db.CATS.length && catOn !== 'new'" class="note">
        <text class="note-t">还没有品类。点上面的「新增」加一个。</text>
      </view>
      <view v-for="c in db.CATS" :key="c" class="srow">
        <view class="cat-n">
          <text class="srow-k">{{ c }}</text>
          <text v-if="usedOf(c)" class="cat-used">记过 {{ usedOf(c) }} 笔</text>
        </view>
        <view class="cat-ops">
          <view class="mini" @click="renameCatStart(c)"><text class="mini-t">{{ catOn === c ? '收起' : '改名' }}</text></view>
          <view class="mini mini-del" @click="delCatGo(c)">
            <text class="mini-t">{{ armed === 'cat:' + c ? '确认删' : '删' }}</text>
          </view>
        </view>
      </view>
      <!-- 新建和改名共用这一块：一句话的事，不值得开弹窗 -->
      <view v-if="catOn" class="rt-in">
        <input
          v-model="catDraft"
          class="tin tin-in"
          :placeholder="catOn === 'new' ? '新品类叫什么，比如「宠物」' : '改成叫什么'"
          placeholder-class="tph"
        />
        <view class="chips">
          <view class="btn btn-main" @click="commitCat"><text class="btn-t btn-main-t">{{ catOn === 'new' ? '创建' : '改名' }}</text></view>
          <view class="btn" @click="catOn = ''"><text class="btn-t">取消</text></view>
        </view>
      </view>
      <view class="note">
        <text class="note-t">删掉一个品类只去掉选项，已记的流水一个字不改。</text>
        <text class="note-t">改名会把已记的那几笔一起改过来。</text>
      </view>
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
        <view class="btn" @click="toggleImport"><text class="btn-t">导入</text></view>
      </view>
      <template v-if="showIn">
        <textarea
          v-model="importRaw"
          class="tin tin-ta"
          placeholder="把刚才那份 JSON 粘到这里"
          placeholder-class="tph"
        />
        <view class="chips">
          <view class="btn" @click="readClip"><text class="btn-t">读剪贴板</text></view>
          <view class="btn btn-main" @click="doImport"><text class="btn-t btn-main-t">确认导入</text></view>
        </view>
        <view class="note">
          <text class="note-t">导入会覆盖本机全部数据。</text>
          <text class="note-t">先「复制全部数据」存一份，再导。</text>
        </view>
      </template>
      <view v-else class="note"><text class="note-t">导出一份 JSON，换手机或备份都用它。</text></view>
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
import { computed, ref } from 'vue'
import {
  db, go, money, TODAY, summaryOf, recordTypesOf, togglePin, newDomain,
  snapshot, storeFailed, importSnapshot, saveState,
  ruleName, ruleTargetLabel, ruleMatchLabel, ruleStats, ruleMatches, whyNot,
  toggleRule, moveRule, saveRule, armDelete, delArmed, disarmDelete,
  addCat, renameCat, catUsed,
  resolveCapture, describeCapture
} from '../stores/db'
import RuleForm from '../components/RuleForm.vue'

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

/* ---------------- 新建领域 ---------------- */
const adding = ref(false)
const newName = ref('')

function startAdd() {
  adding.value = true
  newName.value = ''
}
function createDomain() {
  const r = newDomain(newName.value)
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  adding.value = false
  saveState(true)
  /* 建完直接进那个领域：空领域里下一步就是加东西，
     把人留在卡片列表里等于让他再点一次自己刚建的那张。 */
  db.DOMAIN_ID = r.domain.id
  go('domain')
  uni.showToast({ title: '已创建「' + r.name + '」', icon: 'none' })
}

/* ---------------- 记账品类 ---------------- */
const catOn = ref('')      /* 'new' = 正在新建；否则是正在改名的那个品类名 */
const catDraft = ref('')
const armed = delArmed

function usedOf(c) { return catUsed(c) }

function newCat() {
  if (catOn.value === 'new') { catOn.value = ''; return }
  catOn.value = 'new'
  catDraft.value = ''
}
function renameCatStart(c) {
  if (catOn.value === c) { catOn.value = ''; return }
  catOn.value = c
  catDraft.value = c
}
function commitCat() {
  const v = catDraft.value.trim()
  if (!v) { uni.showToast({ title: '先写个名字', icon: 'none' }); return }
  const r = catOn.value === 'new' ? addCat(v) : renameCat(catOn.value, v)
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  catOn.value = ''
  saveState(true)
  uni.showToast({
    title: r.moved === undefined ? '已加「' + r.name + '」' : '已改名，' + r.moved + ' 笔也跟着改过来了'
  , icon: 'none' })
}
/* 这几颗按钮的名字刻意和 stores/db 里那几个错开（Start / Go 后缀）：
   同名会把 import 的那个遮掉，commitCat 里就再也叫不动真正的改名了。 */
function delCatGo(c) {
  const r = armDelete('cat:' + c)
  if (!r) return
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  if (catOn.value === c) catOn.value = ''
  saveState(true)
  uni.showToast({ title: '已去掉「' + r.name + '」· 已记的没改', icon: 'none' })
}

/* ---------------- 导入 ---------------- */
const showIn = ref(false)
const importRaw = ref('')

function toggleImport() {
  showIn.value = !showIn.value
  if (!showIn.value) importRaw.value = ''
}
/* 手机上「把文件里的内容弄进一个输入框」这一步，粘比选文件省事得多：
   导出那半边本来就是复制到剪贴板，来回走同一条路。 */
function readClip() {
  uni.getClipboardData({
    success: function (res) {
      const v = String(res.data || '').trim()
      if (!v) { uni.showToast({ title: '剪贴板里是空的', icon: 'none' }); return }
      importRaw.value = v
      uni.showToast({ title: '已粘进来，检查一下再确认', icon: 'none' })
    },
    fail: function () { uni.showToast({ title: '读不到剪贴板，手动粘一下', icon: 'none' }) }
  })
}
function doImport() {
  const err = importSnapshot(importRaw.value)
  if (err) { uni.showToast({ title: err, icon: 'none' }); return }
  showIn.value = false
  importRaw.value = ''
  /* 导入换掉了全部数据：正在编辑的那张草稿表、武装待删的那颗按钮都不该留着 */
  disarmDelete()
  uni.showToast({ title: '已导入，本机数据已换成这份', icon: 'none' })
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
  uni.showToast({ title: was === 'new' ? '规则已加上，排在最前面' : '规则已保存', icon: 'none' })
}

function flip(ru) { toggleRule(ru.id) }

function shift(ru, d) {
  if (moveRule(ru.id, d)) return
  /* 到边了，或者那一头是另一组 —— 两种都不许，但没必要分两句说 */
  uni.showToast({ title: '挪不动：到边或不能跨组', icon: 'none' })
}

/* 两段确认，和删一条待办同一套：第一下只是武装，4 秒内再点一下才算。 */
function delRule(ru) {
  const r = armDelete('rule:' + ru.id)
  if (!r) return
  if (r.error) { uni.showToast({ title: r.error, icon: 'none' }); return }
  if (editing.value === ru.id) editing.value = ''
  uni.showToast({ title: '规则已删掉', icon: 'none' })
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
/* 就地起名字那张卡 */
.card-adding { grid-column: 1 / -1; }
.tin-in { margin-top: 8px; background: var(--bg); }
.tin-ta { width: 100%; height: 88px; margin-top: 10px; padding: 8px 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; font-size: 12px; color: var(--text); box-sizing: border-box; }

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
.addbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  margin-left: 10px;
  padding: 0 11px;
  border: 1px solid var(--line2);
  border-radius: 15px;
}
.addbtn-t { font-size: 12px; color: var(--accent); }
.addbtn:active { background: var(--accent-bg); }

/* 品类那一行：名字 + 「记过 N 笔」，右边两颗按钮 */
.cat-n { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: row; align-items: baseline; }
.cat-used { margin-left: 8px; font-size: 11px; color: var(--muted); }
.cat-ops { flex: 0 0 auto; display: flex; flex-direction: row; align-items: center; }
.rt-in { margin-top: 8px; }

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
