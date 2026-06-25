use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};

use serde::Serialize;

type DropFileRegistry = Arc<Mutex<HashMap<String, PathBuf>>>;

static DROP_BATCH_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Serialize)]
struct NativeDroppedFile {
    filename: String,
    url: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let drop_file_registry: DropFileRegistry = Arc::new(Mutex::new(HashMap::new()));
    let protocol_registry = drop_file_registry.clone();

    tauri::Builder::default()
    .manage(drop_file_registry)
    .register_uri_scheme_protocol("supersplat-drop", move |_ctx, request| {
      let key = request.uri().path().trim_start_matches('/').to_string();
      let path = protocol_registry
        .lock()
        .ok()
        .and_then(|registry| registry.get(&key).cloned());

      if let Some(path) = path {
        match fs::read(&path) {
          Ok(data) => {
            return tauri::http::Response::builder()
              .header("Access-Control-Allow-Origin", "*")
              .header("Content-Type", "application/octet-stream")
              .body(data)
              .unwrap();
          }
          Err(err) => {
            return tauri::http::Response::builder()
              .status(500)
              .header("Access-Control-Allow-Origin", "*")
              .header("Content-Type", "text/plain; charset=utf-8")
              .body(format!("failed to read '{}': {}", path.display(), err).into_bytes())
              .unwrap();
          }
        }
      }

      tauri::http::Response::builder()
        .status(404)
        .header("Access-Control-Allow-Origin", "*")
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(format!("unknown dropped file key: {}", key).into_bytes())
        .unwrap()
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::DragDrop(event) = event {
        match event {
          tauri::DragDropEvent::Enter { paths, position } => {
            println!("[file-drop] enter: {:?} at {:?}", paths, position);
            log::info!("[file-drop] enter: {:?} at {:?}", paths, position);
          }
          tauri::DragDropEvent::Over { .. } => {
            // Intentionally quiet: this fires continuously while the pointer moves.
          }
          tauri::DragDropEvent::Drop { paths, position } => {
            println!("[file-drop] drop: {:?} at {:?}", paths, position);
            log::info!("[file-drop] drop: {:?} at {:?}", paths, position);

            let path_strings = paths
              .iter()
              .map(|path| path.to_string_lossy().to_string())
              .collect::<Vec<_>>();

            match serde_json::to_string(&path_strings) {
              Ok(paths_json) => {
                let script = format!(
                  "if (window.__supersplatNativeFileDrop) {{ window.__supersplatNativeFileDrop({}); }} else {{ window.__supersplatPendingNativeFileDrops = window.__supersplatPendingNativeFileDrops || []; window.__supersplatPendingNativeFileDrops.push({}); }}",
                  paths_json,
                  paths_json
                );

                if let Some(webview) = window.webviews().first() {
                  if let Err(err) = webview.eval(script) {
                    println!("[file-drop] failed to dispatch frontend event: {}", err);
                    log::error!("[file-drop] failed to dispatch frontend event: {}", err);
                  } else {
                    println!("[file-drop] forwarded to frontend at {:?}", position);
                    log::info!("[file-drop] forwarded to frontend at {:?}", position);
                  }
                } else {
                  println!("[file-drop] no webview found for frontend dispatch");
                  log::error!("[file-drop] no webview found for frontend dispatch");
                }
              }
              Err(err) => {
                println!("[file-drop] failed to serialize paths: {}", err);
                log::error!("[file-drop] failed to serialize paths: {}", err);
              }
            }
          }
          tauri::DragDropEvent::Leave => {
            println!("[file-drop] leave");
            log::info!("[file-drop] leave");
          }
          _ => {}
        }
      }
    })
    .invoke_handler(tauri::generate_handler![
      open_native_file_dialog,
      resolve_native_dropped_files,
      window_minimize,
      window_toggle_maximize,
      window_is_maximized,
      window_close,
      window_start_drag
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn open_native_file_dialog() -> Vec<String> {
    rfd::FileDialog::new()
        .add_filter(
            "Supported scene files",
            &[
                "ply",
                "splat",
                "json",
                "webp",
                "sog",
                "lcc",
                "bin",
                "txt",
                "ksplat",
                "spz",
                "glb",
                "gltf",
                "obj",
                "stl",
                "png",
                "jpg",
                "jpeg",
            ],
        )
        .pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

fn normalize_relative_path(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn encode_url_path_component(value: &str) -> String {
    let mut encoded = String::new();

    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~' | b'/') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }

    encoded
}

fn dropped_file_url(key: &str) -> String {
    #[cfg(any(windows, target_os = "android"))]
    {
        format!("http://supersplat-drop.localhost/{}", key)
    }

    #[cfg(not(any(windows, target_os = "android")))]
    {
        format!("supersplat-drop://localhost/{}", key)
    }
}

fn collect_native_dropped_file(
    path: &Path,
    root: Option<&Path>,
    batch_id: u64,
    registry: &DropFileRegistry,
    files: &mut Vec<NativeDroppedFile>,
) -> Result<(), String> {
    if path.is_dir() {
        let root = root.unwrap_or(path);
        let mut entries = fs::read_dir(path)
            .map_err(|err| format!("failed to read directory '{}': {}", path.display(), err))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| {
                format!(
                    "failed to read directory entry '{}': {}",
                    path.display(),
                    err
                )
            })?;

        entries.sort_by_key(|entry| entry.path());

        for entry in entries {
            collect_native_dropped_file(&entry.path(), Some(root), batch_id, registry, files)?;
        }
        return Ok(());
    }

    if !path.is_file() {
        return Ok(());
    }

    let filename = if let Some(root) = root {
        path.strip_prefix(root)
            .map(normalize_relative_path)
            .unwrap_or_else(|_| {
                path.file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_else(|| path.to_string_lossy().to_string())
            })
    } else {
        path.file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string())
    };

    let key = format!("{}/{}", batch_id, encode_url_path_component(&filename));
    registry
        .lock()
        .map_err(|_| "failed to lock dropped file registry".to_string())?
        .insert(key.clone(), path.to_path_buf());

    files.push(NativeDroppedFile {
        filename,
        url: dropped_file_url(&key),
    });
    Ok(())
}

#[tauri::command]
fn resolve_native_dropped_files(
    paths: Vec<String>,
    registry: tauri::State<'_, DropFileRegistry>,
) -> Result<Vec<NativeDroppedFile>, String> {
    println!("[file-drop] resolving native dropped files: {:?}", paths);
    log::info!("[file-drop] resolving native dropped files: {:?}", paths);

    let mut files = Vec::new();
    let batch_id = DROP_BATCH_ID.fetch_add(1, Ordering::Relaxed);

    for path in paths {
        collect_native_dropped_file(&PathBuf::from(path), None, batch_id, &registry, &mut files)?;
    }

    println!("[file-drop] resolved {} file(s)", files.len());
    log::info!("[file-drop] resolved {} file(s)", files.len());

    Ok(files)
}

#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|err| err.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: tauri::Window) -> Result<bool, String> {
    if window.is_maximized().map_err(|err| err.to_string())? {
        window.unmaximize().map_err(|err| err.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|err| err.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
fn window_is_maximized(window: tauri::Window) -> Result<bool, String> {
    window.is_maximized().map_err(|err| err.to_string())
}

#[tauri::command]
fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|err| err.to_string())
}

#[tauri::command]
fn window_start_drag(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|err| err.to_string())
}
