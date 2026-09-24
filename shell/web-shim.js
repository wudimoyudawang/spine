/* 只有装进原生壳里才会跑到的这一小段 —— 构建时被拼进 index.html。
 *
 * 它的职责是**在页面和 Capacitor 之间架桥**，而且只架桥：
 * 往 window 上挂几个 SPINE_* 钩子，页面那边只认「有没有那个钩子」，
 * 永远不直接碰 window.Capacitor。这样同一份前端代码在浏览器、在
 * Capacitor 壳、将来在 DCloud 壳里都对 —— 页面不会被某个壳绑死。
 *
 * 目前两个钩子：
 *   window.SPINE_SAVE_FILE   存文件 + 系统分享（见下面 Filesystem 那段坑）
 *   window.SPINE_NOTIFY      习惯提醒：apply 排程 / check 权限 / request 权限
 *
 * 为什么注入得够早：这段被拼在 </body> 之前，而页面代码是 type="module"
 * （module 一律延迟执行），所以这段一定先跑完。少一个钩子时的降级行为
 * 由页面那一侧决定（见 app/src/lib/notify.js 和 spaces.vue 的 saveFile）。
 */
(function () {
  if (!window.Capacitor || typeof window.Capacitor.isNativePlatform !== 'function') return
  if (!window.Capacitor.isNativePlatform()) return
  var P = window.Capacitor.Plugins
  if (!P) return

  /* ---------------- 存文件 ----------------
   * 为什么需要它：**WebView 里 `a[download]` 不生效**（浏览器那套下载机制在
   * Android WebView 里没有对应实现）。所以「存成文件」必须改走原生：
   * 先写进 App 的缓存目录，再调系统分享面板，让你存进「文件」或者发给别人。
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
  if (P.Filesystem) {
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
  }

  /* ---------------- 习惯提醒 ----------------
   * 页面那边已经把「未来 7 天该在哪一刻响哪一颗」算好了（db.remindPlan，
   * 是个纯函数、有对拍钉着），这里只负责转手给系统，不做任何时间算术。
   *
   * 为什么排的是**一批定点通知**而不是让系统做「每天重复」：
   * 插件的 `repeats: true` 拿 `at - now` 当固定间隔，跨月份长度会漂；
   * `every: 'day'` 同病。定点排一批、每次打开重排，行为完全可预测，
   * 而且「今天已经打过卡了就别再响」这种条件才有可能实现。
   *
   * apply(list)：list 是 [{id, at(毫秒), title, time, key}]，**全量替换**语义 ——
   *   先把系统里已排的清干净，再排这一批。所以调用方不需要知道「该取消哪一颗」。
   *   传空数组 = 清空了事，这是关掉开关那条路的用法。
   *
   * 拿不到通知权限时：`notificationsEnabled` 为假，插件的 schedule 会 reject，
   * 由页面那侧捕获并如实报出来 —— 这里不吞异常。
   *
   * smallIcon 不给：插件的默认回退是 android.R.drawable.ic_dialog_info
   * （见 LocalNotificationManager.getDefaultSmallIcon），能用；
   * 想换成自己的图标要往 res/drawable 里放资源，那是壳的事，不该在 JS 里写死名字。
   *
   * channelId 用一个自建渠道而不是插件的 "default"：渠道的重要性在
   * **创建之后就不能改了**，而 "default" 是插件自己建的、参数不由我们定。
   * 自建一个 importance 3 的，以后想调提醒的打扰程度才有地方调。 */
  if (P.LocalNotifications) {
    var LN = P.LocalNotifications
    var CHANNEL = 'habit-reminders'
    var channelReady = null

    function ensureChannel() {
      if (channelReady) return channelReady
      channelReady = LN.createChannel({
        id: CHANNEL,
        name: '习惯提醒',
        description: '到点提醒你打卡',
        importance: 3
      }).catch(function () { return null })
      return channelReady
    }

    window.SPINE_NOTIFY = {
      /* 全量替换排程。返回 Promise。 */
      apply: function (list) {
        return ensureChannel().then(function () {
          return LN.getPending()
        }).then(function (res) {
          var old = (res && res.notifications) || []
          /* 先清再排。清和排拆成两步而不是排完就完 ——
             编号是我们自己算的（db.remindIdOf），清一遍能保证
             「上一批里已经不该响的那几颗」真的没了。 */
          if (old.length) return LN.cancel({ notifications: old.map(function (n) { return { id: n.id } }) })
        }).then(function () {
          if (!list || !list.length) return { scheduled: 0 }
          return LN.schedule({
            notifications: list.map(function (o) {
              return {
                id: o.id,
                title: o.title,
                body: '到点打卡了',
                channelId: CHANNEL,
                schedule: {
                  at: new Date(o.at),
                  /* allowWhileIdle：手机进 Doze 时也让它响。
                     不设的话，晚上排的那颗在息屏久了的机器上会被推后 ——
                     一个习惯提醒晚半小时，那基本等于没提醒。 */
                  allowWhileIdle: true
                },
                extra: { key: o.key, time: o.time }
              }
            })
          }).then(function (r) { return { scheduled: (r && r.notifications && r.notifications.length) || 0 } })
        })
      },
      /* 权限状态：'granted' / 'denied' / 'prompt' */
      check: function () {
        return LN.checkPermissions().then(function (s) { return (s && s.display) || 'prompt' })
      },
      /* 申请权限。已经是 granted 时插件直接返回 granted，不会再弹框 ——
         所以这个函数可以放心被反复调用。 */
      request: function () {
        return LN.requestPermissions().then(function (s) { return (s && s.display) || 'denied' })
      }
    }
  }
})()
