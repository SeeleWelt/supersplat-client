#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
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
