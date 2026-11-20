#![allow(non_snake_case)]

use mwhe_sync_server::{
    lan_urls, listen, share, Hub, PairingInput, PairingPayload, Snapshot, SYNC_PORT,
};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Mutex;
use tauri::State;

pub struct SyncApp {
    inner: Mutex<Option<Running>>,
}

struct Running {
    hub: mwhe_sync_server::SharedHub,
    urls: Vec<String>,
}

impl Default for SyncApp {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedInput {
    stored: Option<Value>,
    roster_deltas: Vec<Value>,
    hub_version: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingResponse {
    view: Snapshot,
    payload: PairingPayload,
}

fn running(state: &SyncApp) -> Result<RunningHandle, String> {
    let guard = state.inner.lock().map_err(|_| "Stations are busy.".to_string())?;
    let running = guard.as_ref().ok_or_else(|| "The station listener is not ready.".to_string())?;
    Ok(RunningHandle {
        hub: running.hub.clone(),
        urls: running.urls.clone(),
    })
}

struct RunningHandle {
    hub: mwhe_sync_server::SharedHub,
    urls: Vec<String>,
}

async fn ensure(state: &SyncApp) -> Result<RunningHandle, String> {
    {
        let guard = state.inner.lock().map_err(|_| "Stations are busy.".to_string())?;
        if let Some(running) = guard.as_ref() {
            return Ok(RunningHandle {
                hub: running.hub.clone(),
                urls: running.urls.clone(),
            });
        }
    }
    let hub = share(Hub::new("0.4.0"));
    listen(hub.clone(), SYNC_PORT)
        .await
        .map_err(|err| format!("Could not listen for phones on port {SYNC_PORT}: {err}"))?;
    let urls = lan_urls(SYNC_PORT);
    let mut guard = state.inner.lock().map_err(|_| "Stations are busy.".to_string())?;
    if guard.is_none() {
        *guard = Some(Running {
            hub: hub.clone(),
            urls: urls.clone(),
        });
    }
    let running = guard.as_ref().expect("listener");
    Ok(RunningHandle {
        hub: running.hub.clone(),
        urls: running.urls.clone(),
    })
}

#[tauri::command]
pub async fn sync_seed(state: State<'_, SyncApp>, input: SeedInput) -> Result<Snapshot, String> {
    let running = ensure(&state).await?;
    let mut hub = running.hub.write().await;
    hub.seed(input.stored, input.roster_deltas, &input.hub_version)?;
    Ok(hub.snapshot(&running.urls))
}

#[tauri::command]
pub async fn sync_set_roster(state: State<'_, SyncApp>, deltas: Vec<Value>) -> Result<Snapshot, String> {
    let running = running(&state)?;
    let mut hub = running.hub.write().await;
    hub.set_roster(deltas)?;
    Ok(hub.snapshot(&running.urls))
}

#[tauri::command]
pub async fn sync_snapshot(state: State<'_, SyncApp>) -> Result<Snapshot, String> {
    let running = running(&state)?;
    let hub = running.hub.read().await;
    Ok(hub.snapshot(&running.urls))
}

#[tauri::command]
pub async fn sync_create_pairing(
    state: State<'_, SyncApp>,
    input: PairingInput,
) -> Result<PairingResponse, String> {
    let running = running(&state)?;
    let mut hub = running.hub.write().await;
    let payload = hub.create_pairing(input, &mwhe_sync_server::hub_now())?;
    Ok(PairingResponse {
        view: hub.snapshot(&running.urls),
        payload,
    })
}

#[tauri::command]
pub async fn sync_show_pairing(
    state: State<'_, SyncApp>,
    pairingId: String,
    hubUrl: Option<String>,
) -> Result<PairingResponse, String> {
    let running = running(&state)?;
    let mut hub = running.hub.write().await;
    let payload = hub.show_pairing(&pairingId, hubUrl, &mwhe_sync_server::hub_now())?;
    Ok(PairingResponse {
        view: hub.snapshot(&running.urls),
        payload,
    })
}

#[tauri::command]
pub async fn sync_import_punches(state: State<'_, SyncApp>, text: String) -> Result<Snapshot, String> {
    let running = running(&state)?;
    let mut hub = running.hub.write().await;
    hub.import_text(&text)?;
    Ok(hub.snapshot(&running.urls))
}

#[tauri::command]
pub async fn sync_roster_qr(
    state: State<'_, SyncApp>,
    eventId: String,
    since: i64,
) -> Result<Vec<String>, String> {
    let running = running(&state)?;
    let hub = running.hub.read().await;
    hub.roster_qr(&eventId, since)
}

#[tauri::command]
pub async fn sync_set_clock_warn_ms(
    state: State<'_, SyncApp>,
    clockOffsetWarnMs: i64,
) -> Result<Snapshot, String> {
    let running = running(&state)?;
    let mut hub = running.hub.write().await;
    hub.set_clock_warn_ms(clockOffsetWarnMs)?;
    Ok(hub.snapshot(&running.urls))
}

#[tauri::command]
pub async fn sync_add_punch(state: State<'_, SyncApp>, punch: Value) -> Result<Snapshot, String> {
    let running = running(&state)?;
    let mut hub = running.hub.write().await;
    hub.add_punch(punch)?;
    Ok(hub.snapshot(&running.urls))
}

#[tauri::command]
pub async fn sync_set_manual_start(state: State<'_, SyncApp>, start: Value) -> Result<Snapshot, String> {
    let running = running(&state)?;
    let mut hub = running.hub.write().await;
    hub.set_manual_start(start)?;
    Ok(hub.snapshot(&running.urls))
}

#[tauri::command]
pub async fn sync_set_row_clock(state: State<'_, SyncApp>, start: Value) -> Result<Snapshot, String> {
    let running = running(&state)?;
    let mut hub = running.hub.write().await;
    hub.set_row_clock(start)?;
    Ok(hub.snapshot(&running.urls))
}

#[tauri::command]
pub async fn sync_set_station_apk(
    state: State<'_, SyncApp>,
    manifest: Value,
    apkBase64: String,
) -> Result<(), String> {
    let running = running(&state)?;
    let apk = mwhe_sync_server::decode_apk_base64(&apkBase64)?;
    let mut hub = running.hub.write().await;
    hub.set_station_update(manifest, apk)?;
    Ok(())
}

#[tauri::command]
pub async fn sync_void_punch(state: State<'_, SyncApp>, uuid: String) -> Result<Snapshot, String> {
    let running = running(&state)?;
    let mut hub = running.hub.write().await;
    hub.void_punch(&uuid)?;
    Ok(hub.snapshot(&running.urls))
}
