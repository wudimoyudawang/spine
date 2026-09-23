/* 界面用语与提示的唯一出口。
 *
 * 原先 107 处 `uni.showToast({ title: …, icon: 'none' })` 各写一遍 ——
 * 想统一改（加时长、同样的话不重复弹、换成别的提示方式）就得改 107 处。
 * 文案也一样：同一句「再点一次『确认删』」在 10 个地方各写了一份，
 * 改一次措辞要满仓库找。
 *
 * 这一层只碰「界面怎么说」，不碰数据；依赖方向是 ui → db，单向。 */
import { armDelete, saveState } from '../stores/db'

/* 全项目唯一的提示出口 */
export function toast(title) {
  uni.showToast({ title: String(title == null ? '' : title), icon: 'none' })
}

/* 两段确认里第一下之后要说的那句。**只在这里写一次**。 */
export const CONFIRM_HINT = '再点一次「确认删」'

/* 删除的统一入口：武装 → 真删 → 存盘。
 *
 * 闸门（armDelete / delArmed）本来就在数据层，但外层这套
 * 「武装了要提示、删掉了要存盘、失败了要报错」的流程被 8 个删除入口各写了一遍
 * （del / delSelf / delRt / delRule / delRow / delGo / restoreGo / clearGo），
 * 其中 restoreGo / clearGo 甚至连闸门都另起了一套（各自的 clearArmed / bkArmed + 定时器）。
 *
 * 返回值三种：
 *   { armed: true, msg }   只是武装起来了，调用方把 msg 提示出去即可
 *   { error, msg }         删不掉（内置规则、最后一个领域、那条已经不在了…）
 *   { done: { what, label } }  真删了
 *
 * 成功那句**故意不在这里统一**：各处的后果本来就不一样，要强调的东西也不同 ——
 * 删品类要说「已记的没改」，删记录项要说「已记的还在数据里」，
 * 删领域要说「内容已回到收件箱」。统一成「已删除」等于把最要紧的半句丢掉。 */
export function confirmDelete(spec) {
  const r = armDelete(spec)
  if (!r) return { armed: true, msg: CONFIRM_HINT }
  if (r.error) return { error: r.error, msg: r.error }
  saveState(true)
  return { done: r }
}
