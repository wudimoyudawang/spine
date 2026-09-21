/* 只有装进原生壳里才会跑到的这一小段 —— 构建时被拼进 index.html。
 *
 * 为什么需要它：**WebView 里 `a[download]` 不生效**（浏览器那套下载机制在
 * Android WebView 里没有对应实现）。所以「存成文件」必须改走原生：
 * 先写进 App 的缓存目录，再调系统分享面板，让你存进「文件」或者发给别人。
 *
 * 做法是给页面挂一个 window.SPINE_SAVE_FILE。页面那边**优先用它**，
 * 没有它才走浏览器那套 —— 这样同一份前端代码在两个环境里都对，
 * 页面本身不需要知道 Capacitor 的存在（也就不会被壳绑死）。
 */
(function () {
  if (!window.Capacitor || typeof window.Capacitor.isNativePlatform !== 'function') return
  if (!window.Capacitor.isNativePlatform()) return
  var P = window.Capacitor.Plugins
  if (!P || !P.Filesystem) return

  function say(msg) {
    if (window.uni && window.uni.showToast) { window.uni.showToast({ title: msg, icon: 'none' }) }
    else { window.alert(msg) }
  }

  window.SPINE_SAVE_FILE = function (name, text) {
    var b64
    try {
      /* 中文要先转 UTF-8 再 base64，直接 btoa 会在非 ASCII 上抛错 */
      b64 = window.btoa(unescape(encodeURIComponent(text)))
    } catch (e) { say('导出失败：' + e.message); return }

    P.Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE', encoding: 'base64' })
      .then(function (res) {
        if (P.Share) return P.Share.share({ title: name, url: res.uri })
        say('已写到 ' + res.uri)
      })
      .catch(function (e) { say('导出失败：' + ((e && e.message) || e)) })
  }
})()
