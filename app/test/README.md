# app/test —— 回归验证

改 `stores/db.js`、`views/`、`components/` 之前先跑这个。三套东西各有分工，
不是重复劳动：**数据层改完靠对拍、组件改完靠交互测试、界面改完靠端到端 + 截图**。

```bash
npm test                 # 对拍 + 组件交互（不需要浏览器，几秒）
npm run test:equiv       # 只跑行为等价性对拍
npm run test:component   # 只跑组件交互测试
npm run test:e2e         # 端到端（要先 npm run build:h5，会起浏览器）
```

---

## 1. `equiv.cjs` —— 行为等价性对拍（金标准回归）

**它守的线**：重构不许改行为。

`digest.cjs` 把 `stores/db.js` 加载起来、灌一批刻意造得刁钻的数据，然后把**所有受影响的输出**
做成一份确定的快照，存在 `fixtures/digest.json`。当前代码的输出和金标准逐字节比对。

覆盖范围：各种取数、聚合、格式化、规则判断、增删改的结果、清空与备份的往返、
**导入的语义**（整体替换 / 缺项即清空 / 坏档案一动不动 / 导入前先留备份 / 不全把人踢出当前页）。

> 捕获点的**确切数量以 `equiv.cjs` 的输出为准** —— 增删一个捕获点就会变。
> 别把数字写进文档（原来这里写「161 个」，实际已经漂到 164 了）。

```bash
node test/equiv.cjs            # 比对
node test/equiv.cjs --update   # 看过差异之后，接受为新的金标准
```

**差异必须逐条看。** 是刻意改的（新增字段、按注释订正行为）就 `--update`；
不是刻意的，就是你改坏了。

### 两个让它立得住的关键

- **时钟冻结**（`lib/frozen-clock.cjs`）：`db.js` 在模块加载时就把 `TODAY` 算成
  `isoOf(new Date())`，种子日期随之整体平移，自动 id 里还带着 `Date.now()`。
  不冻结的话结果**明天就不一样了**，金标准根本没法存。冻结之后完全可复现。
- **造数据刻意刁钻**：空父项、三层嵌套、孤儿 `parent`、重名习惯、不存在的 id、
  空日期与缺字段的脏记录、跨周跨月周边界、**区间重叠**（本期与上期有交集）。
  这几类正是优化时最容易悄悄改掉语义的地方 —— 本项目就是靠它抓到过一处
  「索引顺手丢掉了空日期的脏打卡记录」的真实行为差异。

`fixtures/digest.json` 是**要入库的**，它就是这份回归测试的基准。

## 2. `component.cjs` —— 组件交互测试

**它守的线**：编译产物对了，不等于运行期对。

把 `FreqField.vue` 真挂到 jsdom 里、真点它，断言它有没有把 `change` 事件发出去。
这个组件出过一个只看代码很难发现的缺陷：模板里写的是 `@click="unit = u"`（直接赋值），
赋值生效、选中态也高亮，但 `emit('change')` 整条链断掉 —— 表现是「点了『每周』，
保存下去还是『每天』」，而且再碰一下 ± 步进器又正常了。

需要**先编译 SFC**（`@vue/compiler-sfc`，工程里已有），再用沙箱把它的相对 import 接好。

**依赖 jsdom**，而本项目刻意没把它列进 `package.json`。装上就能跑：

```bash
npm i -D jsdom
# 或者用 SPINE_JSDOM_DIR 指向已装好的位置
```

找不到 jsdom 会打印 `SKIP` 并以 0 退出，不阻塞 `npm test`。

## 3. `e2e.cjs` —— 端到端（真实浏览器 + CDP）

**它守的线**：界面上真的能用。

Node 22 自带 `WebSocket`，所以不需要 puppeteer。它起一个静态服务 + 一个无头浏览器，
然后：

1. **走一遍缺陷路径**：在真实界面上「新增习惯 → 点每周 → 点 3 次 → 提交 → 读回那一行」，
   确认存下去的是「每周 3 次」而不是默认的「每天」。这比任何单元断言都有说服力。
2. 逐页切一遍并截图，当作「改动不该动到界面」的证据。

```bash
npm run build:h5
node test/e2e.cjs                      # 截图到 test/.shots/
node test/e2e.cjs --shots ../shots-a   # 指定目录（做改动前后像素比对用）
```

### 做「纯样式改动」的像素比对

CSS 去重这类改动的验证方式是：改动前后各截一套图，逐像素比。

```bash
node test/e2e.cjs --shots before/
# ……改样式……
npm run build:h5
node test/e2e.cjs --shots after/
# 然后比 before/ 和 after/ 下同名 png
```

同渲染器、同视口、同内容时 PNG 编码是确定性的，**先试逐字节相等**；
不相等再解 PNG 逐像素比（PNG 用 zlib 解压后按滤波器还原即可，不需要装图像库）。

---

## lib/

| 文件 | 作用 |
|---|---|
| `lib/sandbox.cjs` | 把 `app/src` 下的模块（连同相对依赖）拷到**系统临时目录**、补 import 扩展名、给裸包名（vue）造转发入口。拷到仓库外是为了不产生任何需要 gitignore 的东西 |
| `lib/frozen-clock.cjs` | 冻结 `Date`，让 `TODAY`、种子平移量、自动 id 全部确定 |

## 已知限制

- `sandbox.cjs` 把依赖**拍平**到同一个目录 —— 目前 store 只有 `db.js` + `seed.js`（同目录），
  够用。以后出现跨目录的相对依赖要改成保留目录结构。
- `e2e.cjs` 需要 Edge/Chrome；找不到会打印提示并以 0 退出。
- 端到端会往浏览器 localStorage 写东西（新增一个测试习惯），每次都用全新的
  `--user-data-dir`，所以不影响你本机浏览器里的数据。
