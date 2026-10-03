import { createSSRApp } from 'vue'
import App from './App.vue'
import { loadState, applyHomePage } from './stores/db'

/* 先把上次存的东西读回来，再建 App。
   放到 App.vue 的 onLaunch 里就晚了 —— 页面会先按空数据渲染一帧，
   屏幕上闪一下「什么都没有」，然后才填上内容。 */
loadState()

/* 「打开应用先看哪一页」。必须**紧跟**在 loadState 之后：
   它要盖掉刚恢复回来的 `CURRENT`，而 `CURRENT` 就是落地页。
   放别处（比如 App.vue 的 onLaunch）会让视图先按旧的那一页挂载一帧 ——
   屏幕上闪一下今日，然后才跳到记账。
   设置是「上次停留」时它什么都不做，也就是老行为。 */
applyHomePage()

export function createApp() {
  const app = createSSRApp(App)
  return { app }
}
