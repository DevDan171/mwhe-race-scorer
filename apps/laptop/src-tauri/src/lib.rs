mod credentials;
mod sign_in;

use credentials::{credential_clear, credential_get, credential_set};
use sign_in::{
    cancel_sign_in_callback, open_sign_in_page, start_sign_in_callback, wait_sign_in_callback,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            credential_get,
            credential_set,
            credential_clear,
            open_sign_in_page,
            start_sign_in_callback,
            wait_sign_in_callback,
            cancel_sign_in_callback
        ])
        .run(tauri::generate_context!())
        .expect("error while running MWHE laptop");
}
