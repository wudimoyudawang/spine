/* 冻结时钟。
 *
 * 为什么必须冻结：db.js 在**模块加载时**就把 TODAY 算成 `isoOf(new Date())`，
 * 种子数据的日期也随之整体平移（SHIFT = dayCount('2026-09-18', TODAY)），
 * 自动生成的 id 里还带着 `Date.now().toString(36)`。
 * 不冻结的话，对拍结果**明天就会不一样**，金标准文件（golden file）根本立不住。
 *
 * 冻结之后：TODAY 恒定、种子平移量恒定、id 也变成确定值 —— 于是整个快照
 * 逐字节可复现，等价性对拍才能从「今天跑一遍」升级成「随时跑都一样的回归测试」。
 *
 * 用法：必须在 import db.js **之前**调用 install()。 */
const FROZEN_ISO = '2026-09-23T10:30:00+08:00'

function install(iso) {
  const RealDate = Date
  const fixed = RealDate.parse(iso || FROZEN_ISO)

  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed)
      else super(...args)
    }
    static now() { return fixed }
  }
  /* 把静态成员补齐，避免有代码用 Date.UTC / Date.parse 时行为不同 */
  FrozenDate.UTC = RealDate.UTC
  FrozenDate.parse = RealDate.parse
  globalThis.Date = FrozenDate
  return { fixed, restore() { globalThis.Date = RealDate } }
}

module.exports = { install, FROZEN_ISO }
