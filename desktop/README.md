# 桌面版 · Windows（Tauri）

把原型页直接做成了 Windows 桌面应用：**exe 只是执行器，页面和数据都在它旁边**，
改界面、改数据格式都不需要重新编译 exe。

## 拿起来就用（便携版）

```
portable/
├── 计划中枢.exe      ← 双击运行（约 6MB，免安装）
├── web/
│   └── index.html    ← 整个界面与逻辑，用任何编辑器改，重启即生效
└── data/
    └── state.json    ← 你的全部数据（首次运行自动创建）
```

把 `portable/` 整个文件夹放到任何位置（U 盘也行）就能用。
exe 启动时先看自己旁边有没有 `web\index.html`：有 → 便携模式，数据写 `data\`；
没有 → 退回安装模式，数据写 `%APPDATA%\com.spine.planner\`。

**改了 HTML 或 JSON 格式，永远不用重新打包 exe。** 只有改窗口本身的行为
（尺寸、标题栏、吸附逻辑）才需要动 Rust 壳。

### 桌面版特性

- 无边框窗口 + 自绘标题栏（可拖动、最小化/最大化/关闭）
- 默认手机尺寸 420×880，启动自动贴屏幕右边缘；最窄可拉到 360，窄屏下行内按钮自动换行
- 边框吸附：窗口拖近屏幕上/右边缘时自动贴齐（设置页可关）
- 开机自启（设置页开关）
- 每 2 秒自动保存 + 失焦即存；写入走「临时文件 → 改名」，崩溃不会写坏数据

## 自己编译

需要 [Rust](https://rustup.rs) + VS Build Tools + Node。在 `app/` 下：

```bash
npm install
npm run tauri dev     # 开发：改 Rust 代码即时重编译
npm run tauri build   # 产出 exe（target\release\）
```

> 开发模式下页面是编译进 exe 的，改 `dist/index.html` 后要碰一下
> `src-tauri/src/main.rs`（随便存一下）才会触发重建；便携模式读磁盘文件，无此问题。

## 目录

| 路径 | 内容 |
|---|---|
| `app/dist/index.html` | 页面最新版（原型 + 持久化层 + 标题栏 + 窄屏适配） |
| `app/src-tauri/` | Rust 壳：`main.rs` 约 200 行，负责窗口、读写 JSON、磁盘资源 |
| `portable/` | 组装好的便携版（`data/` 不入库，那是个人数据） |
