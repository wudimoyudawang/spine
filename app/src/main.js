import { createSSRApp } from 'vue'
import App from './App.vue'
import { loadState } from './stores/db'

/* 先把上次存的东西读回来，再建 App。
   放到 App.vue 的 onLaunch 里就晚了 —— 页面会先按空数据渲染一帧，
   屏幕上闪一下「什么都没有」，然后才填上内容。 */
loadState()

export function createApp() {
  const app = createSSRApp(App)
  return { app }
}
