/* 一键出 APK。以后重打就直接跑这个。
 *
 *   node make-apk.cjs
 *
 * 四步：构建 app 的 H5 → 搬进壳 → 同步进 Android 工程 → Gradle 打 release 包。
 * 打出来的包会拷到仓库根目录的 release/spine.apk（那个路径在 .gitignore 里被单独放行）。
 *
 * JDK 和 Android SDK 都不在仓库里，靠**环境变量**找（换机器不用改代码）：
 *
 *   SPINE_JDK          JDK 17 的目录          没设就用 JAVA_HOME
 *   SPINE_ANDROID_SDK  Android SDK 的目录     没设就用 ANDROID_HOME / ANDROID_SDK_ROOT
 *
 * 都没有，再退回本机默认的 C:\workbuddy\.toolchains\{jdk,android-sdk}。
 * SDK 找到后会顺手写进 android/local.properties（那个文件不进仓库，每台机器一份）。
 *
 * 签名读 shell/keystore.properties；没有它也能出包，但会退回 Gradle 的 debug 签名
 * —— 能装，但签名随机器变，以后升级要卸载重装。见 README。
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')

const HERE = __dirname
const REPO = path.resolve(HERE, '..')
const ANDROID = path.join(HERE, 'android')
const OUT = path.join(REPO, 'release', 'spine.apk')

const NODE = process.execPath
const CAP = path.join(HERE, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor')

function die(msg) { console.log('!! ' + msg); process.exit(1) }
function head(t) { console.log(''); console.log('===== ' + t + ' =====') }

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 1800000 }, opts || {}))
  const out = ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/).filter(l => l.trim())
  if (r.error) { console.log('  !! ' + r.error.message); return { status: -1, out: out } }
  return { status: r.status, out: out }
}

/* ---- 找 JDK 和 Android SDK ---- */

function pickDir(label, candidates) {
  for (const c of candidates) {
    if (!c) continue
    if (fs.existsSync(c)) { console.log('  ' + label + ' = ' + c); return c }
  }
  return null
}

const TC = 'C:/workbuddy/.toolchains'
const JDK = pickDir('JDK', [
  process.env.SPINE_JDK, process.env.JAVA_HOME,
  path.join(TC, 'jdk'), path.join(HERE, '..', '.toolchains', 'jdk'),
])
const SDK = pickDir('Android SDK', [
  process.env.SPINE_ANDROID_SDK, process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
  path.join(TC, 'android-sdk'), path.join(HERE, '..', '.toolchains', 'android-sdk'),
  path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
])

if (!JDK) die('没找到 JDK。设个 SPINE_JDK 或 JAVA_HOME 指向 JDK 17 的目录。')
if (!fs.existsSync(path.join(JDK, 'bin', 'java.exe'))) die('这个 JDK 目录不对（没有 bin/java.exe）：' + JDK)
if (!SDK) die('没找到 Android SDK。设个 SPINE_ANDROID_SDK 或 ANDROID_HOME 指向 SDK 目录。')

/* SDK 路径写进 local.properties。它不进仓库（每台机器路径不同），
   但 Gradle 不认环境变量、只认这个文件，所以每次跑都刷一遍。 */
{
  const lp = path.join(ANDROID, 'local.properties')
  /* 反斜杠不能进 properties 文件：Java 把它当转义符，`\w` `\.` `\a`
     会被吃成 "C:workbuddy.toolchainsandroid-sdk" —— 「卷标语法不正确」。
     正斜杠 Windows 的 File 照样认，所以统一写成正斜杠。 */
  const line = 'sdk.dir=' + SDK.replace(/\\/g, '/') + '\n'
  const old = fs.existsSync(lp) ? fs.readFileSync(lp, 'utf8') : ''
  if (old !== line) { fs.writeFileSync(lp, line, 'utf8'); console.log('  写了 android/local.properties') }
}

const env = Object.assign({}, process.env, {
  JAVA_HOME: JDK.replace(/\//g, '\\'),
  ANDROID_HOME: SDK.replace(/\//g, '\\'),
  ANDROID_SDK_ROOT: SDK.replace(/\//g, '\\')
})

/* ---- 只查环境：node make-apk.cjs --check ---- */
if (process.argv.indexOf('--check') >= 0) {
  const kp = path.join(HERE, 'keystore.properties')
  const jks = path.join(HERE, 'spine-release.jks')
  console.log('  签名配置   : ' + (fs.existsSync(kp) ? '有' : '**缺**（会退回 debug 签名）'))
  console.log('  keystore   : ' + (fs.existsSync(jks) ? '有' : '**缺**'))
  console.log('  Android 工程: ' + (fs.existsSync(path.join(ANDROID, 'gradlew.bat')) ? '有' : '**缺**'))
  console.log('  壳的依赖    : ' + (fs.existsSync(CAP) ? '有' : '**缺**（先在 shell/ 里跑 npm install）'))
  const capOk = fs.existsSync(CAP)
  console.log('')
  if (JDK && SDK && fs.existsSync(jks) && fs.existsSync(kp) && capOk) {
    console.log('环境齐了。直接 node make-apk.cjs')
    process.exit(0)
  }
  console.log('上面标 ** 的先补齐。')
  process.exit(1)
}

/* ---- 检查签名 ---- */
{
  const kp = path.join(HERE, 'keystore.properties')
  if (!fs.existsSync(kp)) {
    console.log('')
    console.log('  ⚠ 没有 shell/keystore.properties —— 会用 Gradle 的 debug 签名出包。')
    console.log('    能装能用，但**签名随机器变**，以后换机器打的包盖不上，只能卸载重装（数据一起没）。')
    console.log('    想用固定签名：把 keystore.properties 和它指向的 .jks 放到 shell/ 下。')
    console.log('    字段说明见 keystore.properties.example。')
  } else {
    const t = fs.readFileSync(kp, 'utf8')
    const m = t.match(/^\s*storeFile\s*=\s*(.+?)\s*$/m)
    if (!m) {
      die('keystore.properties 里没有 storeFile 这一行。')
    } else {
      let p = m[1]
      /* 相对路径按 shell/ 解析（build.gradle 里也是这么算的） */
      const full = /^([A-Za-z]:[\\/]|[\\/]{2})/.test(p) ? p : path.join(HERE, p)
      if (!fs.existsSync(full)) die('keystore.properties 指向的 keystore 不存在：' + full)
      console.log('  签名用 ' + full)
    }
  }
}

/* ---- 1. 构建 H5 并搬进 www ---- */
head('1/4 构建 H5 产物并搬进壳')
{
  const r = run(NODE, [path.join(HERE, 'build.cjs')], { cwd: HERE })
  r.out.forEach(l => console.log('  ' + l.slice(0, 160)))
  if (r.status !== 0) die('build.cjs 失败')
}

/* ---- 2. 同步进 Android 工程 ---- */
head('2/4 同步进 Android 工程')
{
  const r = run(NODE, [CAP, 'sync', 'android'], { cwd: HERE })
  r.out.forEach(l => console.log('  ' + l.slice(0, 160)))
  if (r.status !== 0) die('cap sync 失败')
}

/* ---- 3. Gradle 打 release 包 ---- */
head('3/4 Gradle assembleRelease')
{
  /* gradlew.bat 不能直接 spawn（新版 Node 的安全限制），经 cmd.exe /c。
     输出**实时透出去**（inherit）而不是攒到最后 —— 这一步要下载依赖，
     几分钟没有输出的话，看起来和卡死一模一样。 */
  const r = spawnSync('cmd.exe',
    ['/c', 'gradlew.bat', 'assembleRelease', '--no-daemon', '--console=plain'],
    { cwd: ANDROID, env: env, stdio: ['ignore', 'inherit', 'inherit'], timeout: 1800000 })
  if (r.error) die(String(r.error.message))
  if (r.status !== 0) die('Gradle 构建失败 exit=' + r.status)
}

/* ---- 4. 拷出来并验签 ---- */
head('4/4 拷出 APK 并验签')
const built = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
if (!fs.existsSync(built)) die('没找到产物：' + built)
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.copyFileSync(built, OUT)
const size = fs.statSync(OUT).size
console.log('  ' + OUT)
console.log('  ' + (size / 1048576).toFixed(1) + ' MB')

const apksigner = path.join(SDK, 'build-tools', '34.0.0', 'apksigner.bat')
if (fs.existsSync(apksigner)) {
  const r = run('cmd.exe', ['/c', apksigner, 'verify', '--print-certs', OUT], { env: env })
  r.out.slice(0, 12).forEach(l => console.log('  ' + l.slice(0, 170)))
} else {
  console.log('  （没找到 apksigner，跳过验签）')
}
console.log('')
console.log('好了。装到手机上：把 release/spine.apk 传到手机，点开装（第一次要允许「未知来源」）。')
