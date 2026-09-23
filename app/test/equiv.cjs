/* 行为等价性对拍（金标准回归测试）。
 *
 *   node test/equiv.cjs             比对当前代码 vs test/fixtures/digest.json
 *   node test/equiv.cjs --update    把当前结果写成新的金标准（会先打印差异让人过一眼）
 *
 * 它守的是「重构不许改行为」这条线：digest 把 db.js 所有受影响的输出取出来，
 * 存成一份确定的快照；任何一次改动如果改了输出，这里就会逐点报出来。
 *
 * 差异需要**逐条判断**：是刻意改的（比如新增字段、按注释订正行为），
 * 就在看过差异后用 --update 接受；不是刻意的，就是 bug。
 */
const fs = require('fs')
const path = require('path')
const { digest } = require('./digest.cjs')

const GOLDEN = path.join(__dirname, 'fixtures', 'digest.json')
const MAX_SHOW = 240

function short(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (s === undefined) return '<无>'
  return s.length > MAX_SHOW ? s.slice(0, MAX_SHOW) + ' …（共 ' + s.length + ' 字符）' : s
}

function diff(want, got) {
  const keys = Array.from(new Set([...Object.keys(want || {}), ...Object.keys(got || {})])).sort()
  const bad = []
  for (const k of keys) {
    const a = JSON.stringify(want ? want[k] : undefined)
    const b = JSON.stringify(got[k])
    if (a !== b) bad.push({ k, a: want ? want[k] : undefined, b: got[k], hard: !(k in (want || {})) })
  }
  return { keys, bad }
}

async function main() {
  const update = process.argv.includes('--update')
  /* 计时必须用 hrtime：digest 会把 Date 冻结成固定时刻，用 Date.now() 差出来是负数 */
  const t0 = process.hrtime.bigint()
  const got = await digest()
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  const n = Object.keys(got).length

  if (!fs.existsSync(GOLDEN)) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true })
    fs.writeFileSync(GOLDEN, JSON.stringify(got, null, 1))
    console.log('首次生成金标准：' + path.relative(process.cwd(), GOLDEN))
    console.log('捕获点 ' + n + ' 个，用时 ' + ms.toFixed(0) + 'ms')
    return 0
  }

  const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'))
  const { bad } = diff(want, got)

  console.log('=== 行为等价性对拍 ===')
  console.log('  捕获点 ' + n + ' 个，一致 ' + (n - bad.length) + ' 个，不一致 ' + bad.length + ' 个，用时 ' + ms.toFixed(0) + 'ms')

  if (!bad.length) {
    console.log('  结论：PASS —— 输出与金标准逐字节一致。')
    return 0
  }

  console.log('')
  console.log('=== 差异明细 ===')
  for (const d of bad) {
    console.log('  [差异] ' + d.k)
    console.log('     金标准: ' + short(d.a))
    console.log('     现在  : ' + short(d.b))
  }

  if (update) {
    fs.writeFileSync(GOLDEN, JSON.stringify(got, null, 1))
    console.log('')
    console.log('已按上面的差异更新金标准（' + bad.length + ' 个捕获点被接受为新的预期）。')
    console.log('**请确认每一条都是刻意的** —— 对拍的价值就在于逼人把差异看一遍。')
    return 0
  }

  console.log('')
  console.log('  结论：FAIL —— 上面 ' + bad.length + ' 个捕获点和金标准不一致。')
  console.log('  若这些差异是你有意改的，看过之后用 `node test/equiv.cjs --update` 接受为新金标准；')
  console.log('  否则就是你改坏了行为。')
  return 1
}

main().then(code => process.exit(code)).catch(e => {
  console.log('对拍失败：' + (e && e.stack || e))
  process.exit(2)
})
