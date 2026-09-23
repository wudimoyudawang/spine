/* 只有装进原生壳里才会跑到的这一小段 —— 构建时被拼进 index.html。
 *
 * 为什么需要它：**WebView 里 `a[download]` 不生效**（浏览器那套下载机制在
 * Android WebView 里没有对应实现）。所以「存成文件」必须改走原生：
 * 先写进 App 的缓存目录，再调系统分享面板，让你存进「文件」或者发给别人。
 *
 * 做法是给页面挂一个 window.SPINE_SAVE_FILE。页面那边**优先用它**，
 * 没有它才走浏览器那套 —— 这样同一份前端代码在两个环境里都对，
 * 页面本身不需要知道 Capacitor 的存在（也就不会被壳绑死）。
 *
 * 关于 encoding（这里踩过坑，别再改回去）：
 *   Capacitor 的 Filesystem 插件在 Android 上**只认 utf8 / utf16 / ascii**，
 *   传 `encoding: 'base64'` 会被直接拒掉（报 "Unsupported encoding provided: base64"）。
 *   插件的真实分支是：**传了 encoding 就当纯文本写，不传才把 data 当 base64 解码成二进制**。
 *   我们写的是 JSON 文本，所以走 utf8 —— 这也是 iOS 那边唯一支持的取值，
 *   同一份代码在两个平台都对。
 *
 * 返回值：一个 Promise（写文件 → 弹分享面板）。页面那边接住它自己给提示，
 *   因为**注入这段代码的时候 `window.uni` 还没加载**，在这里弹只能掉回原生 alert，
 *   和 app 里其它提示长得不一样。 */
(function () {
  if (!window.Capacitor || typeof window.Capacitor.isNativePlatform !== 'function') return
  if (!window.Capacitor.isNativePlatform()) return
  var P = window.Capacitor.Plugins
  if (!P || !P.Filesystem) return

  window.SPINE_SAVE_FILE = function (name, text) {
    return P.Filesystem.writeFile({
      path: name,
      data: text,
      directory: 'CACHE',
      encoding: 'utf8'
    }).then(function (res) {
      /* 系统分享面板：让你存进「文件」或者直接发给别人。
         Share 插件自己会把 file:// 转成 content://（FileProvider），
         所以这里直接把 uri 传过去就行。 */
      if (P.Share) return P.Share.share({ title: name, url: res.uri })
      return res
    })
  }
})()
