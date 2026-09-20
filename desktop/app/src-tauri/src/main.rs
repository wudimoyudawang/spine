use std::borrow::Cow;
use std::path::{Path, PathBuf};
use tauri::utils::assets::{AssetKey, AssetsIter, CspHash};
use tauri::{AppHandle, Assets, Manager, Wry};

/// exe 所在目录；便携模式下 web\ 和 data\ 都放这里
fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// 判定便携模式：exe 旁边有 web/index.html 就走「外部网页 + 外部数据」布局
fn is_portable() -> bool {
    exe_dir().join("web").join("index.html").exists()
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = if is_portable() {
        exe_dir().join("data")
    } else {
        app.path()
            .app_data_dir()
            .map_err(|e| format!("无法获取应用数据目录: {e}"))?
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("state.json"))
}

#[tauri::command]
fn load_state(app: AppHandle) -> Result<Option<String>, String> {
    let path = state_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) if !s.trim().is_empty() => Ok(Some(s)),
        Ok(_) => Ok(None),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_state(app: AppHandle, json: String) -> Result<(), String> {
    let path = state_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| format!("非法 JSON: {e}"))?;
    std::fs::write(&tmp, json.as_bytes()).map_err(|e| e.to_string())?;
    // 原子替换，避免写一半崩溃导致数据损坏
    std::fs::rename(&tmp, &path).or_else(|_| {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
    })
}

#[tauri::command]
fn data_location(app: AppHandle) -> String {
    state_path(&app)
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "未知".into())
}

/// 便携模式的资源提供者：优先读 exe 旁的 web\ 目录，读不到回退内嵌资源。
/// 页面因此可以脱离编译环境直接改文件生效。
struct DiskAssets {
    root: PathBuf,
    fallback: Box<dyn Assets<Wry>>,
}

impl Assets<Wry> for DiskAssets {
    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        let rel = key.as_ref().trim_start_matches('/');
        let candidate = self.root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        // 防目录穿越：真实路径必须仍在 web\ 内
        if let (Ok(canon_root), Ok(canon)) = (self.root.canonicalize(), candidate.canonicalize()) {
            if canon.starts_with(&canon_root) && canon.is_file() {
                if let Ok(bytes) = std::fs::read(&canon) {
                    return Some(Cow::Owned(bytes));
                }
            }
        }
        self.fallback.get(key)
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.fallback.iter()
    }
    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.fallback.csp_hashes(html_path)
    }
}

/// 占位实现，用来从 set_assets 手里换出真正的内嵌资源
struct PlaceholderAssets;
impl Assets<Wry> for PlaceholderAssets {
    fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }
    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

fn main() {
    let mut context = tauri::generate_context!();
    if is_portable() {
        // 在启动前替换资源提供者：页面改为从 exe 旁的 web\ 目录读取
        let embedded = context.set_assets(Box::new(PlaceholderAssets));
        context.set_assets(Box::new(DiskAssets {
            root: exe_dir().join("web"),
            fallback: embedded,
        }));
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                // 启动即贴住主屏幕右上角，手机尺寸
                if let Ok(Some(m)) = w.primary_monitor() {
                    let mp = m.position();
                    let ms = m.size();
                    if let Ok(os) = w.outer_size() {
                        let x = mp.x + ms.width as i32 - os.width as i32 - 8;
                        let y = mp.y + 8;
                        let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
                    }
                }
                let _ = w.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_state, save_state, data_location])
        .run(context)
        .expect("error while running tauri application");
}
