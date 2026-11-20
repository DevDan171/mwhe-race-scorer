mod credentials;
mod sign_in;
mod sync_cmd;

use credentials::{
    credential_clear, credential_get, credential_get_vault, credential_set, credential_set_vault,
};
use sign_in::{
    cancel_sign_in_callback, open_sign_in_page, start_sign_in_callback, wait_sign_in_callback,
};
use sync_cmd::{
    sync_add_punch, sync_create_pairing, sync_import_punches, sync_roster_qr, sync_seed,
    sync_set_clock_warn_ms, sync_set_manual_start, sync_set_roster, sync_set_row_clock,
    sync_show_pairing, sync_snapshot, sync_void_punch,
    SyncApp,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SyncApp::default())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            credential_get,
            credential_set,
            credential_clear,
            credential_get_vault,
            credential_set_vault,
            open_sign_in_page,
            start_sign_in_callback,
            wait_sign_in_callback,
            cancel_sign_in_callback,
            sync_seed,
            sync_set_roster,
            sync_snapshot,
            sync_create_pairing,
            sync_show_pairing,
            sync_import_punches,
            sync_roster_qr,
            sync_set_clock_warn_ms,
            sync_add_punch,
            sync_void_punch,
            sync_set_manual_start,
            sync_set_row_clock
        ])
        .run(tauri::generate_context!())
        .expect("error while running MWHE laptop");
}
