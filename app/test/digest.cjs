/* 金标准（golden file）的取材脚本：
   把 stores/db.js 加载起来，灌一批**刻意造得刁钻**的数据，然后把所有受影响的
   输出做成稳定 JSON 返回。

   设计要点：
   · 时钟先冻结（见 lib/frozen-clock.cjs），所以 TODAY / 种子平移 / 自动 id 全都确定，
     同一份代码任何时候跑都得到同一串字节 —— 金标准文件才立得住。
   · 对象键排序后再序列化，避免键序差异造成假不等。
   · 每个捕获点包 try/catch，把抛错也当成一个值记下来 ——
     「新版不抛了 / 新版开始抛了」都是差异，必须看得见。
   · 造数据覆盖：空父项、三层嵌套、孤儿 parent、重名习惯、不存在的 id、
     空日期与缺字段的脏记录、跨周跨月周边界的日期、**区间重叠**（本期与上期有交集）。
   · 会改状态的用例统一放在最后，各自从 loadSeed() 重新开始，
     免得扰乱了前面那些只读捕获点。
   · 涉及自动生成 id 的用例（addSub / rollRepeat / commitAdd）只记录**位置与形状**，
     不记录 id 本身 —— 换一台机器或换一天跑也不会假失败。
*/
const path = require('path')
const { pathToFileURL } = require('url')
const { makeSandbox } = require('./lib/sandbox.cjs')
const frozenClock = require('./lib/frozen-clock.cjs')

const pad2 = n => (n < 10 ? '0' : '') + n
const iso = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())

function stable(v) {
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v).sort()) o[k] = stable(v[k])
    return o
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v)
  return v
}

async function digest() {
  frozenClock.install()
  const box = makeSandbox()
  try {
    box.linkVue()
    const entry = box.copyGraph('stores/db.js')
    const M = await import(pathToFileURL(entry).href)
    return await collect(M)
  } finally {
    box.cleanup()
  }
}

async function collect(M) {
  const {
    db, loadSeed, snapshot, TODAY,
    todayTree, habitTree, goalTree, quadRows,
    monthView, dayRows, dayMarks, weekView, moneyBrief,
    habitDaysInRange, streakText, habitRowExtra,
      habitDoneOn, habitCountOn, habitCountInRange, bumpHabitLog, toggleHabitLog, replaceAll,
      recentPhrases, addNote, addTodo,
    remindTimeOf, setHabitRemind, remindPlan, remindStats, remindAtOf, remindIdOf,
    reviewData, searchAll, localCounts,
    allCaptureOptions, commonCaptureOptions, catList, metricDefs, metricLine,
    trendRows, trendCandidates,
    ruleStats, ruleTargetOptions, pickRule, ruleTargetLabel,
    isoOfCnDate, cnDateOf, exportFileName, saveStateText, backupList,
    clearAllData, commitAdd, addSub, rollRepeat, deleteNode, classifyInbox,
    openEdit, closeEdit, editFields, ED,
    money, fmtCN, fmtCNWide, weekdayCN, dayCount, shiftDays, startOfWeek, startOfMonth, endOfMonth, pad2: pad,
    monthMoney,
    quadOf, setQuad, quadName, quadTone, quadColorOf, quadVarStyle, setQuadColor,
    FREQ_UNITS, parseFreq, freqText,
    parseDatePhrase, firstNumber, restOf, resolveCapture, describeCapture,
    guessCategory, catUsed, summaryOf, recordTypesOf, domainContentCount, domainName,
    topLevel, specOf, resolveNode, labelOf,
    progressOf, clampP, repeatName, rowBody, rowText,
    flattenTree
  } = M

  const out = {}
  const cap = (name, fn) => {
    try { out[name] = stable(fn()) }
    catch (e) { out[name] = 'THREW: ' + (e && e.message) }
  }

  /* ================= 造数据 ================= */
  function build() {
    loadSeed()
    db.HABIT_LOGS.length = 0

    /* 两个「重名习惯」：weekView 的打卡格按**名字**去重，必须有同名样本 */
    db.DOMAINS[0].habits.push({ id: 'hDup1', t: '重名习惯', m: '每周 3 次', parent: null })
    db.DOMAINS[1].habits.push({ id: 'hDup2', t: '重名习惯', m: '每月 2 次', parent: null })
    /* 三层嵌套 */
    db.DOMAINS[0].habits.push({ id: 'hDeep', t: '深层父', m: '每天', parent: null })
    db.DOMAINS[0].habits.push({ id: 'hDeep2', t: '中层', m: '每天', parent: 'hDeep' })
    db.DOMAINS[0].habits.push({ id: 'hDeep3', t: '最内层', m: '每天', parent: 'hDeep2' })

    const habitIds = []
    db.DOMAINS.forEach(d => (d.habits || []).forEach(h => habitIds.push(h.id)))
    let n = 0
    for (const id of habitIds) {
      n++
      if (n % 3 === 0) continue                    /* 每三个留一个「一次都没打过」 */
      for (let d = 0; d < 40; d++) {
        if ((d + n) % 7 === 0) continue            /* 制造断裂 */
        db.HABIT_LOGS.push({ key: id, date: iso(new Date(2026, 5, 1 + d)) })
      }
    }
    db.HABIT_LOGS.push({ key: 'hGhost', date: '2026-06-15' })   /* 不存在的习惯 */
    db.HABIT_LOGS.push({ key: habitIds[0], date: '' })          /* 空日期脏数据 */

    /* 待办：跨周边界（周日/周一）、跨月边界、已完成、子项、孤儿 parent、无日期 */
    db.ITEMS.length = 0
    const marks = ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-18', '2026-09-20',
      '2026-09-21', '2026-08-31', '2026-09-30', '2026-10-01', null]
    const doms = db.DOMAINS.map(d => d.id)
    for (let i = 0; i < 60; i++) {
      db.ITEMS.push({
        id: 'it' + i, title: '待办 ' + i,
        dom: i % 9 === 0 ? null : doms[i % doms.length],
        due: marks[i % marks.length],
        status: i % 3 === 0 ? 'done' : 'todo',
        parent: i > 0 && i % 5 === 0 ? 'it' + (i - 1) : null,
        imp: i % 2 === 0, urg: i % 3 === 0
      })
    }
    db.ITEMS.push({ id: 'itOrphan', title: '孤儿', dom: null, due: '2026-09-18', status: 'todo', parent: 'itNope', imp: false, urg: false })

    /* 支出：跨月，分类含空串与 null，值含非数字 */
    db.LOGS.length = 0
    const cats = ['餐饮', '出行', '', null, '娱乐']
    for (let i = 0; i < 90; i++) {
      db.LOGS.push({
        id: 'lg' + i, kind: 'money',
        date: iso(new Date(2026, 7, 1 + (i % 61))),
        category: cats[i % cats.length], value: (i % 17) * 3.33
      })
    }
    db.LOGS.push({ id: 'lgBad', kind: 'money', date: '', category: '餐饮', value: 'oops' })
    db.LOGS.push({ id: 'lgNaN', kind: 'money', date: '2026-09-10', category: '餐饮' })

    /* 记录项：数值 + 文字，含已 retired 的 */
    db.RECORD_TYPES.forEach((t, ti) => {
      t.logs = []
      for (let i = 0; i < 12; i++) {
        t.logs.push({
          id: 'k' + ti + '_' + i,
          d: (1 + (i % 28)) + '月' + (1 + (i % 28)) + '日' + (i % 2 ? ' 周三' : ''),
          v: t.mode === 'number' ? 70 + (i % 7) : '内容 ' + i
        })
      }
    })
    if (db.RECORD_TYPES[0]) db.RECORD_TYPES[0].retired = true
  }

  const stripRowExtras = rows => {
    for (const r of (rows || [])) {
      delete r.streak; delete r.doneToday
      delete r.todayCount; delete r.periodCount; delete r.target; delete r.unit
    }
    return rows
  }

  build()

  /* ================= 只读捕获 ================= */
  cap('TODAY', () => TODAY)
  cap('todayTree', () => todayTree('2026-09-18'))
  cap('todayTree.other', () => todayTree('2026-09-14'))
  cap('todayTree.empty', () => todayTree('2027-01-01'))
  cap('habitTree', () => stripRowExtras(habitTree()))
  cap('goalTree', () => stripRowExtras(goalTree()))

  /* 习惯行上的便捷字段：必须和单独算出来的一模一样，且一个不少 ——
     TreeList 的打卡按钮直接读它们，少一个按钮就退化成单次的样子。 */
  cap('habitTree.extrasMatch', () => habitTree().map(r => ({
    id: r.node.id,
    hasStreakKey: Object.prototype.hasOwnProperty.call(r, 'streak'),
    hasDoneKey: Object.prototype.hasOwnProperty.call(r, 'doneToday'),
    hasTargetKey: Object.prototype.hasOwnProperty.call(r, 'target'),
    hasPeriodKey: Object.prototype.hasOwnProperty.call(r, 'periodCount'),
    hasTodayKey: Object.prototype.hasOwnProperty.call(r, 'todayCount'),
    streakEq: JSON.stringify(r.streak) === JSON.stringify(streakText(r.node.id)),
    doneEq: r.doneToday === habitRowExtra(r.node).doneToday,
    targetEq: r.target === habitRowExtra(r.node).target,
    periodEq: r.periodCount === habitRowExtra(r.node).periodCount
  })))
  /* 计划行不该带这些字段 */
  cap('goalTree.noExtras', () => goalTree().map(r => [
    Object.prototype.hasOwnProperty.call(r, 'streak'),
    Object.prototype.hasOwnProperty.call(r, 'doneToday'),
    Object.prototype.hasOwnProperty.call(r, 'target')
  ]))

  cap('quadRows', () => quadRows())
  cap('flattenTreeItems', () => flattenTree(db.ITEMS, null, 0))
  cap('flattenTree.depthPath', () => flattenTree(db.ITEMS, null, 0).map(r => ({ id: r.node.id, d: r.depth, k: r.kids, c: r.closed, p: r.path })))
  cap('labelOf', () => [labelOf({ title: 'a' }), labelOf({ t: 'b' }), labelOf({}), labelOf(null)])
  cap('topLevel', () => topLevel(flattenTree(db.ITEMS, null, 0)))

  for (const d of ['2026-09-13', '2026-09-14', '2026-09-18', '2026-09-20', '2026-09-21', '2026-10-01', '2026-09-10', '2026-08-31']) {
    cap('dayRows:' + d, () => dayRows(d))
    cap('dayMarks:' + d, () => dayMarks(d))
  }
  for (const a of ['2026-09-14', '2026-09-20', '2026-09-21', '2026-08-31', '2026-10-01']) {
    cap('weekView:' + a, () => weekView(a))
  }
  for (const a of ['2026-09-01', '2026-08-01', '2026-10-01', '2026-02-01']) {
    cap('monthView:' + a, () => monthView(a))
  }

  /* 区间：正常 / **重叠** / 同一天 / 无上期 / 空 / 起止颠倒 */
  cap('moneyBrief.normal', () => moneyBrief('2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31'))
  cap('moneyBrief.overlap', () => moneyBrief('2026-09-01', '2026-09-30', '2026-09-15', '2026-09-30'))
  cap('moneyBrief.sameDay', () => moneyBrief('2026-09-10', '2026-09-10', '2026-09-10', '2026-09-10'))
  cap('moneyBrief.noPrev', () => moneyBrief('2026-09-01', '2026-09-30', '', ''))
  cap('moneyBrief.empty', () => moneyBrief('2027-01-01', '2027-01-02', '2027-01-01', '2027-01-02'))
  cap('moneyBrief.reversed', () => moneyBrief('2026-09-30', '2026-09-01', '2026-08-31', '2026-08-01'))

  /* 逐习惯 */
  const habitById = {}
  db.DOMAINS.forEach(d => (d.habits || []).forEach(h => { habitById[h.id] = h }))
  for (const id of Object.keys(habitById)) {
    cap('habitDaysInRange:' + id, () => habitDaysInRange(id, '2026-06-01', '2026-06-30'))
    cap('streakText:' + id, () => [streakText(id), streakText(id, '2026-06-20')])
    cap('habitRowExtra:' + id, () => habitRowExtra(habitById[id]))
  }
  cap('streakText.ghost', () => streakText('hGhost'))
  cap('habitRowExtra.ghost', () => habitRowExtra({ id: 'hGhost', m: '每天' }, '2026-06-20'))

  cap('reviewData', () => reviewData())
  cap('reviewData.custom', () => {
    db.REV_MODE = 'custom'; db.REV_FROM = '2026-09-15'; db.REV_TO = '2026-09-30'
    const r = reviewData()
    db.REV_MODE = 'week'; db.REV_FROM = ''; db.REV_TO = ''
    return r
  })

  cap('searchAll.todo', () => searchAll('待办'))
  cap('searchAll.partial', () => searchAll('kt'))
  cap('searchAll.empty', () => searchAll(''))
  cap('searchAll.miss', () => searchAll('zzzzz'))

  cap('allCaptureOptions', () => allCaptureOptions())
  cap('commonCaptureOptions', () => commonCaptureOptions())
  cap('catList', () => catList())
  cap('metricDefs', () => metricDefs())
  cap('metricLine.money', () => metricLine({ k: 'money', name: '支出', unit: '¥' }, reviewData()))
  cap('metricLine.todo', () => metricLine({ k: 'todo', name: '待办完成', unit: '' }, reviewData()))
  cap('trendRows', () => trendRows())
  cap('trendCandidates', () => trendCandidates())
  cap('ruleStats', () => ruleStats())
  cap('ruleTargetOptions', () => ruleTargetOptions())
  cap('pickRule.kcal', () => { const r = pickRule('1800 kcal'); return r ? r.id : null })
  cap('pickRule.money', () => { const r = pickRule('32 午餐'); return r ? r.id : null })
  cap('pickRule.weight', () => { const r = pickRule('体重 71.4 kg'); return r ? r.id : null })
  cap('ruleTargetLabel', () => ['money', 'money:餐饮', 'todo', 'note', 'inbox', 'nope'].map(ruleTargetLabel))
  cap('resolveCapture.auto', () => resolveCapture('1800 kcal', 'auto'))
  cap('resolveCapture.money', () => resolveCapture('32 午餐', 'auto'))
  cap('resolveCapture.todo', () => resolveCapture('明天交周报', 'auto'))
  cap('resolveCapture.manualNote', () => resolveCapture('32 午餐', 'note'))
  cap('resolveCapture.rtManual', () => resolveCapture('71.4', 'rt:rt_weight'))
  cap('resolveCapture.empty', () => resolveCapture('   ', 'auto'))
  cap('describeCapture.all', () => [
    resolveCapture('1800 kcal', 'auto'), resolveCapture('32 午餐', 'auto'),
    resolveCapture('明天交周报', 'auto'), resolveCapture('随便一句', 'note')
  ].map(describeCapture))

  cap('parseDatePhrase', () => ['明天交周报', '后天', '大后天', '今天', '周五交', '下周一', '下下周三', '9月30日', '30号', '月底', '没有日期词'].map(x => parseDatePhrase(x)))
  cap('firstNumber', () => ['', 'x', '71.4 kg', '32午餐'].map(firstNumber))
  cap('restOf', () => [restOf('体重 71.4 kg', 71.4), restOf('1800 kcal', 1800), restOf('', null)])
  cap('guessCategory', () => ['午餐', '打车', '看电影', '凭空一句'].map(guessCategory))
  cap('catUsed', () => catList().map(c => [c, catUsed(c)]))

  cap('summaryOf', () => db.DOMAINS.map(d => summaryOf(d, recordTypesOf(db.RECORD_TYPES, d.id).length)))
  cap('recordTypesOf', () => db.DOMAINS.map(d => recordTypesOf(db.RECORD_TYPES, d.id).map(t => t.id)))
  cap('domainContentCount', () => db.DOMAINS.map(domainContentCount))
  cap('domainName', () => db.ITEMS.slice(0, 6).map(domainName))

  cap('progressOf.spec', () => ['goal:g-fitness-1', 'goal:g-fitness-1a', 'goal:nope'].map(progressOf))
  cap('clampP', () => [-5, 0, 50.4, 100, 150, 'x', null].map(clampP))
  cap('quadOf.setQuad.quadName', () => ['1', '2', '3', '4'].map(q => {
    const node = {}; setQuad(node, q); return [quadOf(node), node.imp, node.urg, quadName(q)]
  }))
  cap('quadTone', () => ['1', '2', '3', '4', 'x', ''].map(quadTone))
  cap('quadColorOf', () => ['q1', 'q2', 'q3', 'q4'].map(quadColorOf))
  cap('quadVarStyle', () => quadVarStyle())
  cap('setQuadColor', () => [setQuadColor('q9', '#ffffff'), setQuadColor('q1', 'nope'), setQuadColor('q1', '#ABCDEF'), quadVarStyle()])
  cap('repeatName', () => ['daily', 'weekly', 'monthly', 'yearly', '', 'x'].map(repeatName))

  /* 非只读接口：读完都收回原状 */
  cap('specOf.resolveNode', () => ['item:it0', 'habit:h-fit-1', 'goal:g-fitness-1', 'item:nope',
    'habit:nope', 'goal:nope', 'garbage', '', 'item:itOrphan'].map(s => {
    const h = resolveNode(s)
    return h ? [h.kind, h.node.id, h.domain ? h.domain.id : null] : null
  }))
  const rtReal = db.RECORD_TYPES.find(t => t.id === 'rt_weight' && (t.logs || []).length)
  cap('openEdit.fields.item', () => { const r = openEdit('item:it0'); const f = editFields().map(x => x.k); const t = ED.title; closeEdit(); return [r, f, t] })
  cap('openEdit.fields.habit', () => { const r = openEdit('habit:h-fit-1'); const f = editFields().map(x => x.k); const t = ED.title; closeEdit(); return [r, f, t] })
  cap('openEdit.fields.money', () => { const r = openEdit('money:lg1'); const f = editFields().map(x => x.k); closeEdit(); return [r, f] })
  cap('openEdit.fields.rt', () => {
    const r = openEdit('rt:' + rtReal.id + '|' + rtReal.logs[0].id)
    const f = editFields().map(x => x.k); const meta = ED.meta; closeEdit()
    return [r, f, meta]
  })
  cap('openEdit.miss', () => { const r = openEdit('rt:nope|nope'); closeEdit(); return r })
  cap('openEdit.goalUnsupported', () => { const r = openEdit('goal:g-fitness-1'); closeEdit(); return r })

  cap('rowBody.rowText', () => db.TODAY_LOGS.map(e => [rowBody(e), rowText(e)]))

  /* 纯格式化 / 纯工具，与状态无关 */
  cap('money', () => [0, 1, 1.5, 32, 32.456, 1000.005, -3, 'x', null].map(money))
  cap('fmtCN', () => ['2026-09-23', '2026-01-01', '2026-12-31'].map(fmtCN))
  cap('fmtCNWide', () => ['2026-09-23', '2026-01-01', '2026-12-31'].map(fmtCNWide))
  cap('monthMoney', () => ['2026-09', '2026-08', '2026-07', '', '2026-13'].map(p => {
    const m = monthMoney(p)
    return [p, m.sum, m.count, m.list.map(l => l.id)]
  }))
  cap('weekdayCN', () => ['2026-09-20', '2026-09-21', '2026-09-23'].map(weekdayCN))
  cap('dayCount', () => [dayCount('2026-09-01', '2026-09-30'), dayCount('2026-09-30', '2026-09-01'), dayCount('2026-01-01', '2026-12-31')])
  cap('shiftDays', () => [shiftDays('2026-09-23', 1), shiftDays('2026-09-23', -1), shiftDays('2026-01-01', -1)])
  cap('startOfWeek', () => ['2026-09-20', '2026-09-21', '2026-09-23'].map(startOfWeek))
  cap('startOfMonth.endOfMonth', () => ['2026-09-01', '2026-02-01', '2024-02-01'].map(x => [startOfMonth(x), endOfMonth(x)]))
  cap('pad2', () => [0, 9, 10, 99].map(pad))
  cap('isoOfCnDate', () => ['9月18日', '9月18日 周三', '1月1日', '', null, '12月31日'].map(x => isoOfCnDate(x, '2026-09-23')))
  cap('cnDateOf', () => ['2026-09-18', '2026-01-01', '', 'x'].map(cnDateOf))
  cap('exportFileName', () => exportFileName())
  cap('parseFreq.roundTrip', () => ['每天', '每日', '每周', '每月', '每周 3 次', '每月 12 次', '工作日', '', '一周四次'].map(x => {
    const p = parseFreq(x)
    return [x, p, p ? freqText(p.unit, p.n) : null]
  }))
  cap('FREQ_UNITS', () => FREQ_UNITS)
  cap('QUAD_COLORS.default', () => db.QUAD_COLORS)
  cap('REV_TRENDS.default', () => db.REV_TRENDS)
  cap('localCounts', () => localCounts())
  cap('snapshot.readonly', () => snapshot())
  cap('saveStateText.initial', () => saveStateText())
  cap('backupList', () => backupList())

  /* ================= 会改状态的用例（各自从 loadSeed 重新开始） ================= */

  cap('seq.clearAllData', () => {
    const r = clearAllData()
    const keys = ['ITEMS', 'HABIT_LOGS', 'INBOX', 'NOTES', 'NOTE_PROMPTS', 'LOGS', 'DOMAINS',
      'RECORD_TYPES', 'CAPTURE_MODES', 'AUTO_RULES', 'TODAY_LOGS', 'CAT_WORDS', 'CATS',
      'CAP_CFG', 'REV_TRENDS', 'QUAD_COLORS', 'CLOSED_NODES']
    const shape = {}
    for (const k of keys) {
      const v = db[k]
      shape[k] = Array.isArray(v) ? 'array:' + v.length
        : (v && typeof v === 'object' ? 'object:' + Object.keys(v).length : String(v))
    }
    return [r, shape, localCounts(), snapshot(), quadVarStyle()]
  })

  /* C5：加同级子项时，待办 / 习惯 / 计划三处的落位必须一致 */
  cap('seq.addSubOrder', () => {
    loadSeed()
    const pos = (arr, before) => arr.findIndex(x => before.indexOf(x) < 0)
    const bItems = db.ITEMS.map(x => x.id)
    const r1 = addSub('item:it3', '新的待办子项')
    const aItems = db.ITEMS.map(x => x.id)
    const dLife = db.DOMAINS.find(d => d.id === 'life')
    const bHabits = dLife.habits.map(x => x.id)
    const r2 = addSub('habit:h-life-1', '新的习惯子项')
    const aHabits = dLife.habits.map(x => x.id)
    const dStudy = db.DOMAINS.find(d => d.id === 'study')
    const bGoals = dStudy.goals.map(x => x.id)
    const r3 = addSub('goal:g-study-1', '新的计划子项')
    const aGoals = dStudy.goals.map(x => x.id)
    return {
      itemIndex: pos(aItems, bItems), itemTotal: aItems.length,
      habitIndex: pos(aHabits, bHabits), habitTotal: aHabits.length,
      goalIndex: pos(aGoals, bGoals), goalTotal: aGoals.length,
      parents: [r1.node.parent, r2.node.parent, r3.node.parent],
      inherited: [r1.node.due, r1.node.dom, r1.node.imp, r1.node.urg]
    }
  })

  cap('seq.rollRepeat', () => {
    loadSeed()
    /* 拿同一个对象反复改，避免因 rollRepeat 往数组头部插入而漂移 */
    const base = db.ITEMS.find(x => x.id === 'it1')
    const made = []
    for (const k of ['daily', 'weekly', 'monthly', 'yearly']) {
      for (const due of ['2026-01-31', '2026-02-28', '2026-12-31', '2026-03-31', '2026-09-23']) {
        base.repeat = k; base.due = due
        const c = rollRepeat(base)
        made.push([k, due, c ? c.due : null])
      }
    }
    base.repeat = null
    return made
  })

  cap('seq.commitAdd', () => {
    loadSeed()
    return [commitAdd('新增的待办', 'none'), commitAdd('新增的习惯', '每周 2 次'),
      commitAdd('新增的计划', '一句说明'), commitAdd('   ', '')].map(x =>
      x && x.error ? { error: x.error } : { kind: x.kind, where: x.where, detail: x.detail })
  })

  cap('seq.deleteNode', () => {
    loadSeed()
    const r = []
    r.push(deleteNode('rule:sys-money'))
    r.push(deleteNode('rule:u-squat'))
    r.push(deleteNode('rt:rt_weight'))
    r.push(deleteNode('cat:餐饮'))
    r.push(deleteNode('trend:money'))
    r.push(deleteNode('habit:h-life-1'))
    r.push(deleteNode('item:nope'))
    r.push(deleteNode('goal:g-study-1'))
    r.push(deleteNode('domain:study'))
    return { results: r, counts: localCounts(), habitLogs: db.HABIT_LOGS.length }
  })

  cap('seq.saveStateThenText', () => {
    loadSeed()
    M.saveState(true)
    return [saveStateText(), M.storeFailed.value]
  })

  cap('seq.backupRoundTrip', () => {
    loadSeed()
    const a = M.autoBackup()
    const list = backupList()
    const r = list.length ? M.restoreBackup(list[0].date) : null
    return [a, list.length, r, localCounts()]
  })

  /* ============ 导入的语义：**整体替换**（不是合并）============
     档案里缺哪一项，本机那一项就清空 —— 档案是一份完整快照，缺什么就是没有。
     改动前是「缺了就保留本机」，所以这一组在改动前会全线不一致，那正是它存在的意义。
     （原来对拍**没有覆盖导入路径**，只有备份和清空 —— 这批改动顺手补上。） */

  cap('seq.importReplace.partial', () => {
    loadSeed()
    const before = localCounts()
    /* 只有两样的残缺档案，而且两样都是空的；其余 14 项一个字没提 */
    const archive = { app: 'spine', fmt: 2, at: 0, v: { ITEMS: [], LOGS: [] }, s: {} }
    const err = M.importSnapshot(JSON.stringify(archive))
    const shape = {}
    for (const k of M.DATA_KEYS) {
      const val = db[k]
      shape[k] = Array.isArray(val) ? 'array:' + val.length : 'object:' + Object.keys(val || {}).length
    }
    return { err, shape, counts: localCounts(), before }
  })

  cap('seq.importReplace.selfExport', () => {
    loadSeed()
    const text = M.exportText()
    /* 导出范围必须与导入范围一致 —— 不一致的话，导入自己刚导出的文件都会丢东西 */
    const keys = Object.keys(JSON.parse(text).v).sort().join(',')
    const before = localCounts()
    const err = M.importSnapshot(text)
    return { err, keys, counts: localCounts(), before }
  })

  cap('seq.importSnapshot.bad', () => {
    loadSeed()
    const before = localCounts()
    /* 三种坏文件都必须被挡住，而且**本机数据一动不动** ——
       「换到一半才报错」是这里最坏的一种失败（屏幕上是新数据、存储里是旧的）。 */
    const r = [
      M.importSnapshot('这不是 JSON'),
      M.importSnapshot('{}'),
      M.importSnapshot(JSON.stringify({ app: 'spine', fmt: 2, v: { ITEMS: 'x' } }))
    ]
    return { r, counts: localCounts(), before }
  })

  cap('seq.importSnapshot.keepsPage', () => {
    loadSeed()
    const archive = JSON.stringify({
      app: 'spine', fmt: 2, at: 0,
      v: { ITEMS: [] }, s: { CURRENT: 'spaces', DOMAIN_ID: 'nope' }
    })
    db.CURRENT = 'review'
    const err1 = M.importSnapshot(archive)
    const a = db.CURRENT          /* 导入的是数据，不该把人从当前这一页踢走 */
    db.CURRENT = 'domain'
    const err2 = M.importSnapshot(archive)
    return { err1, a, err2, b: db.CURRENT }   /* 领域页是唯一例外：那个领域可能不在了 */
  })

  cap('seq.importReplace.malformed', () => {
    loadSeed()
    /* 形态非法的项当空处理：不该把应用带崩，也不该留下「换了但补不齐 id」的半死状态。
       注意档案里得**留一项合法数组**（ITEMS）才过得了 checkArchive ——
       否则它会在更早一步被当成「没有任何数据」拒掉，测的就成了另一件事。 */
    const archive = {
      app: 'spine', fmt: 2, at: 0,
      v: { ITEMS: [], LOGS: 42, DOMAINS: 'x', CAT_WORDS: 'y' }, s: {}
    }
    const err = M.importSnapshot(JSON.stringify(archive))
    return {
      err,
      itemsIsArray: Array.isArray(db.ITEMS),
      logsIsArray: Array.isArray(db.LOGS),
      domainsIsArray: Array.isArray(db.DOMAINS),
      catWordsIsObject: !!(db.CAT_WORDS && typeof db.CAT_WORDS === 'object' && !Array.isArray(db.CAT_WORDS)),
      counts: localCounts()
    }
  })

  /* ============ 打卡的「多次」与撤销 ============
     n 是可选字段：{key,date} = 1 次（老档案全部长这样），{key,date,n:3} = 3 次。
     这一组钉住五件事：计数、±1 的边界、**索引失效**（改 n 时长度不变，
     不显式作废就会拿到旧表）、老档案（无 n）读出来的次数、以及带 n 的档案
     导出再导入后 n 还在。 */

  cap('seq.habitBump', () => {
    loadSeed()
    const node = db.DOMAINS[0].habits[0]
    const id = node.id
    const todayEntries = () => db.HABIT_LOGS.filter(h => h.key === id && h.date === TODAY)
    const r = {}
    r.countBefore = habitCountOn(id, TODAY)
    r.bumpFromZero = bumpHabitLog(id, 1)
    r.countAfter1 = habitCountOn(id, TODAY)
    r.entriesAfter1 = todayEntries().length
    r.entryAfter1 = { ...todayEntries()[0] }          /* {key,date} —— 1 次不写 n。存摊平快照，不是活引用 */
    bumpHabitLog(id, 1)
    bumpHabitLog(id, 1)
    r.countAfter3 = habitCountOn(id, TODAY)
    /* 省略日期 = 今天。**这一对是给「漏参」钉的钉子**：漏了参数就会退化成
       count[undefined] → 0，而不是抛错，所以只能靠「不传 == 传 TODAY」这条断言抓。
       TreeList 的长按撤销就漏过一次（永远提示「今天还没有打卡记录」）。 */
    r.countNoDate = habitCountOn(id)
    r.doneNoDate = habitDoneOn(id)
    r.entryAfter3 = { ...todayEntries()[0] }          /* {key,date,n:3} —— 同一天还是一条 */
    r.rowExtra = habitRowExtra(node, TODAY)           /* todayCount / periodCount / target / unit */
    r.undo1 = bumpHabitLog(id, -1)
    r.countAfterUndo = habitCountOn(id, TODAY)
    bumpHabitLog(id, -1)
    r.undoToZero = bumpHabitLog(id, -1)               /* 再撤销一次：n 摘掉，条目回到 1 次 */
    r.countAfterZero = habitCountOn(id, TODAY)
    r.entriesAfterZero = todayEntries().length
    r.doneOnAfterZero = habitDoneOn(id, TODAY)        /* set 和 count 不分家 */
    r.undoWhenEmpty = bumpHabitLog(id, -1)            /* 本来就没打：无事发生 */
    return r
  })

  cap('seq.habitBump.legacy', () => {
    loadSeed()
    const id = db.DOMAINS[0].habits[0].id
    const entry = () => db.HABIT_LOGS.filter(h => h.key === id && h.date === '2026-01-05')[0]
    db.HABIT_LOGS.push({ key: id, date: '2026-01-05' })        /* 老档案的样子：没有 n */
    const r = {}
    r.legacyCount = habitCountOn(id, '2026-01-05')             /* 1 */
    r.bump = bumpHabitLog(id, 1, '2026-01-05')                 /* → 2，带上 n */
    /* 存**摊平后的快照**，不是活引用 —— 下面 undo 会 `delete h.n`，而 cap 的
       stable 化在 fn 返回之后才跑，活引用会被那一步「追溯」改掉
       （这个捕获点的第一版就栽在这里：bump 之后明明有 n，存出来却没有）。 */
    r.entryAfterBump = { ...entry() }                          /* {key,date,n:2} */
    r.undo = bumpHabitLog(id, -1, '2026-01-05')                /* → 1 */
    r.entryAfterUndo = { ...entry() }                          /* n 被摘掉，回到老档案的样子 */
    r.toggleOn = toggleHabitLog(id, '2026-01-06')              /* 全有或全无那个还在 */
    r.toggleCount = habitCountOn(id, '2026-01-06')
    r.toggleOff = toggleHabitLog(id, '2026-01-06')
    r.toggleCountAfter = habitCountOn(id, '2026-01-06')
    return r
  })

  cap('seq.habitBump.roundTrip', () => {
    loadSeed()
    const node = db.DOMAINS[0].habits[0]
    const id = node.id
    bumpHabitLog(id, 1)
    bumpHabitLog(id, 1)                                /* 今天 2 次（带 n:2） */
    const before = habitCountOn(id, TODAY)
    const snap = snapshot()
    clearAllData()
    replaceAll(JSON.parse(snap))                       /* 整体替换回来 */
    return {
      before,
      after: habitCountOn(id, TODAY),                  /* n 在序列化往返后还在 */
      entry: { ...db.HABIT_LOGS.filter(h => h.key === id && h.date === TODAY)[0] },
      rowTarget: habitRowExtra(node, TODAY).target
    }
  })

  /* ============ 收件箱归类的日期 ============
     classifyInbox 的第三个参数是尾部可选：不传 = 老行为（待办落今天、领域不限），
     传日期 = 落到那天，传 null = 明确不限。随心记忽略日期。 */
  cap('seq.classifyDate', () => {
    loadSeed()
    db.INBOX.push({ id: 'inX1', text: '归类·默认' })
    db.INBOX.push({ id: 'inX2', text: '归类·指定日子' })
    db.INBOX.push({ id: 'inX3', text: '归类·领域不限' })
    db.INBOX.push({ id: 'inX4', text: '归类·领域带日子' })
    const r = {}
    r.defaultTodo = classifyInbox('inX1', 'todo')
    r.datedTodo = classifyInbox('inX2', 'todo', '2026-10-08')
    r.noneDomain = classifyInbox('inX3', db.DOMAINS[0].id, null)
    r.datedDomain = classifyInbox('inX4', db.DOMAINS[1].id, '2026-10-01')
    const byTitle = t => db.ITEMS.filter(x => x.title === t)[0]
    r.items = ['归类·默认', '归类·指定日子', '归类·领域不限', '归类·领域带日子']
      .map(t => { const x = byTitle(t); return x ? { due: x.due, dom: x.dom } : null })
    r.inboxLeft = db.INBOX.length
    return r
  })

  /* ============ 打卡完成色（设置项） ============
     TICK_DONE 在 UI_KEYS 里：跟着设备走（loadState 会恢复）、replaceAll 不碰它、
     clearAllData 不清它。非法/空值回默认（空串）。 */
  cap('seq.tickColor', () => {
    loadSeed()
    const r = {}
    r.default = db.TICK_DONE                    /* '' */
    r.set = M.setTickDone('#2F6FEB').hex
    r.afterSet = db.TICK_DONE
    r.inSnapshot = JSON.parse(M.snapshot()).s.TICK_DONE
    r.badValue = M.setTickDone('不是颜色').hex    /* 回默认 */
    r.afterBad = db.TICK_DONE
    M.setTickDone('#7C5CC4')
    const snap = M.snapshot()
    M.clearAllData()
    r.afterClear = db.TICK_DONE                 /* 清数据不清外观偏好 */
    M.replaceAll(JSON.parse(snap))
    r.afterReplace = db.TICK_DONE               /* replaceAll 不碰 UI_KEYS */
    return r
  })

  /* ============ 习惯提醒 ============
     rm 是习惯对象上的**可选字段**（'HH:MM'，缺失 = 不提醒）。
     这一组钉住：设/清/非法值、老档案（无 rm）读出来不提醒、
     remindPlan 的跳过规则（过去时刻、天口径已打卡、周月口径不跳）、
     以及通知 id 的稳定性（同一天同一习惯永远同一个 id）。 */
  cap('remindTimeOf', () => [
    remindTimeOf({ rm: '08:30' }), remindTimeOf({ rm: '8:30' }),
    remindTimeOf({ rm: '24:00' }), remindTimeOf({ rm: '08:60' }),
    remindTimeOf({ rm: '' }), remindTimeOf({}), remindTimeOf(null)
  ])
  cap('remindAtOf', () => [remindAtOf('2026-09-23', '08:30'), remindAtOf('2026-09-23', '23:59')])
  cap('remindIdOf.stable', () => [remindIdOf('2026-09-23', '08:30', 'h-fit-1'), remindIdOf('2026-09-23', '08:30', 'h-fit-1')])

  cap('seq.habitRemind.setClear', () => {
    loadSeed()
    const h = db.DOMAINS[0].habits[0]              /* h-fit-1，每周 4 次 */
    const r = {}
    r.defaultNone = remindTimeOf(h)                /* 老档案没 rm = 不提醒 */
    r.set = setHabitRemind(h.id, '08:30')
    r.afterSet = { rm: h.rm, valid: remindTimeOf(h) }
    r.bad = setHabitRemind(h.id, '25:00')
    r.afterBad = h.rm                              /* 非法不落库，原值还在 */
    r.clear = setHabitRemind(h.id, '')
    r.afterClear = { rm: h.rm, valid: remindTimeOf(h) }   /* 清 = 字段被摘掉 */
    r.missing = setHabitRemind('h-nope', '08:30')
    return r
  })

  cap('seq.habitRemind.plan', () => {
    loadSeed()
    /* 冻在 2026-09-23 10:30（见 frozen-clock） */
    const now = Date.now()
    setHabitRemind('h-study-1', '08:30')           /* 每天：今天已打卡 → 今天那颗跳过 */
    setHabitRemind('h-fit-1', '21:00')             /* 每周 4 次：不按天跳过 */
    bumpHabitLog('h-study-1', 1)                   /* 给「每天」的打今天的卡 */
    const plan = remindPlan(2, now)                /* 只看今明两天 */
    return {
      now: now,
      list: plan.map(o => ({ key: o.key, date: o.date, time: o.time, id: o.id })),
      /* h-study-1 今天已打卡 → 今天 08:30 那颗（已过时刻，本来也不排），明天那颗在 */
      dailyTomorrow: plan.filter(o => o.key === 'h-study-1').map(o => o.date),
      /* h-fit-1 周口径：今天 21:00 那颗照排（它今天没打，且 21:00 > 10:30） */
      weeklyToday: plan.filter(o => o.key === 'h-fit-1' && o.date === '2026-09-23').length
    }
  })

  cap('seq.habitRemind.planPast', () => {
    loadSeed()
    const now = Date.now()
    setHabitRemind('h-study-1', '01:00')           /* 凌晨：今天的已过，不排 */
    return remindPlan(1, now).map(o => ({ key: o.key, date: o.date, time: o.time }))
  })

  cap('seq.habitRemind.stats', () => {
    loadSeed()
    const r = {}
    r.before = remindStats().on
    setHabitRemind('h-fit-1', '08:00')
    setHabitRemind('h-study-1', '21:00')
    r.after = remindStats().on
    return r
  })

  /* ============ 常用短语 ============
     从已记内容里挖：待办标题 / 随心记 / 收件箱 / text 型记录。
     前缀匹配重排、太长的（>40 字）不收、单字不收、纯数字型记录不收。 */
  cap('recentPhrases.empty', () => recentPhrases('', 10))
  cap('recentPhrases.nomatch', () => recentPhrases('不存在的词xyz', 10))
  cap('seq.recentPhrases.match', () => {
    loadSeed()
    addNote('喝水 500ml')
    addNote('喝蛋白粉一杯')
    addTodo('喝咖啡提神', 'work', null)
    const got = recentPhrases('喝', 10)
    return {
      /* 带「喝」的短语该顶到最前（前缀匹配重排） */
      top3: got.slice(0, 3),
      top3AllMatch: got.slice(0, 3).every(p => p.indexOf('喝') >= 0)
    }
  })
  cap('seq.recentPhrases.afterAdd', () => {
    loadSeed()
    const before = recentPhrases('喝', 5)
    addNote('喝蛋白粉一杯')            /* 新记一条，应该挤进候选 */
    const after = recentPhrases('喝', 5)
    return { before: before.slice(0, 3), after: after.slice(0, 3) }
  })

  /* 老档案缺 rm：remindPlan 一行都不排、remindStats 是 0。
     这个用例会 importSnapshot 一份残缺档案（把共享状态清空），所以放**最后**，
     不能插在 recentPhrases 那组只读捕获前面 —— 否则会污染它们读到的种子数据。 */
  cap('seq.habitRemind.legacyArchive', () => {
    loadSeed()
    const archive = { app: 'spine', fmt: 2, at: 0, v: { ITEMS: [], LOGS: [] }, s: {} }
    M.importSnapshot(JSON.stringify(archive))
    return { plan: remindPlan(7, Date.now()).length, stats: remindStats().on }
  })

  return out
}

module.exports = { digest, stable }
