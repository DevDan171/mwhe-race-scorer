use std::collections::HashMap;

use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub const SYNC_PORT: u16 = 8788;
const QR_CHUNK_MAX_CHARS: usize = 700;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Station {
    pub pairing_id: String,
    pub pairing_secret: String,
    pub hub_url: String,
    pub event_id: String,
    pub event_name: String,
    pub race_id: String,
    pub race_name: String,
    pub check_id: String,
    pub check_name: String,
    pub device_id: Option<String>,
    pub app_version: Option<String>,
    pub battery_percent: Option<i64>,
    pub clock_offset_ms: Option<i64>,
    pub last_sync_at: Option<String>,
    pub paired_at: String,
    pub go_live_allowed: bool,
    pub roster_version: i64,
    #[serde(default = "role_check")]
    pub role: String,
    #[serde(default)]
    pub start_rows: Vec<StartRowBrief>,
}

fn role_check() -> String {
    "check".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRowBrief {
    pub order: i64,
    pub label: String,
    pub classes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowStart {
    pub schema_version: u8,
    pub uuid: String,
    pub row: i64,
    pub timestamp: String,
    pub created_at: String,
    pub voided: bool,
    pub device_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub race_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clock_offset_ms: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiderStart {
    pub schema_version: u8,
    pub uuid: String,
    pub rider_number: i64,
    pub timestamp: String,
    pub created_at: String,
    pub voided: bool,
    pub device_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub race_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clock_offset_ms: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unknown_number: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualStart {
    pub schema_version: u8,
    pub rider_number: i64,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Punch {
    pub schema_version: u8,
    pub uuid: String,
    pub check_id: String,
    pub device_id: String,
    pub rider_number: i64,
    pub timestamp: String,
    pub created_at: String,
    pub voided: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub race_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clock_offset_ms: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unknown_number: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PhoneRider {
    name: String,
    number: i64,
    class: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RosterDelta {
    schema_version: u8,
    #[serde(rename = "type")]
    kind: String,
    event_id: String,
    version: i64,
    base_version: i64,
    upserts: Vec<PhoneRider>,
    removals: Vec<i64>,
}

#[derive(Debug, Clone)]
pub struct Hub {
    pub settings_warn_ms: i64,
    pub settings_gap_ms: i64,
    pub stations: Vec<Station>,
    pub punches: Vec<Punch>,
    pub row_starts: Vec<RowStart>,
    pub rider_starts: Vec<RiderStart>,
    pub manual_starts: Vec<ManualStart>,
    roster: Vec<RosterDelta>,
    pub hub_version: String,
    station_update: Option<StationApk>,
}

#[derive(Debug, Clone)]
struct StationApk {
    version: String,
    sha256: String,
    apk: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub settings: WarnSetting,
    pub stations: Vec<Station>,
    pub punches: Vec<Punch>,
    pub row_starts: Vec<RowStart>,
    pub rider_starts: Vec<RiderStart>,
    pub manual_starts: Vec<ManualStart>,
    pub listening_urls: Vec<String>,
    pub hub_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WarnSetting {
    pub clock_offset_warn_ms: i64,
    pub min_pass_gap_ms: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingInput {
    pub hub_url: String,
    pub event_id: String,
    pub event_name: String,
    pub race_id: String,
    pub race_name: String,
    pub check_id: String,
    pub check_name: String,
    #[serde(default = "role_check")]
    pub role: String,
    #[serde(default)]
    pub start_rows: Vec<StartRowBrief>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingPayload {
    pub schema_version: u8,
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub hub_url: String,
    pub event_id: String,
    pub event_name: String,
    pub race_id: String,
    pub race_name: String,
    pub check_id: String,
    pub check_name: String,
    pub pairing_secret: String,
    pub laptop_now: String,
    pub hub_version: String,
    pub clock_offset_warn_ms: i64,
    pub role: String,
    pub start_rows: Vec<StartRowBrief>,
}

pub struct HttpReply {
    pub status: u16,
    pub body: Value,
}

impl Hub {
    pub fn new(version: &str) -> Self {
        Self {
            settings_warn_ms: 2_000,
            settings_gap_ms: 120_000,
            stations: Vec::new(),
            punches: Vec::new(),
            row_starts: Vec::new(),
            rider_starts: Vec::new(),
            manual_starts: Vec::new(),
            roster: Vec::new(),
            hub_version: version.to_string(),
            station_update: None,
        }
    }

    /// Keep the signed station APK that matches this laptop, after the checksum matches.
    pub fn set_station_update(&mut self, manifest: Value, apk: Vec<u8>) -> Result<(), String> {
        let version = manifest
            .get("version")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .trim_start_matches('v')
            .to_string();
        let sha = manifest.get("sha256").and_then(Value::as_str).unwrap_or("").trim().to_string();
        if version != self.hub_version.trim().trim_start_matches('v') {
            return Err("That station APK is not this laptop's version.".into());
        }
        if manifest.get("debug").and_then(Value::as_bool).unwrap_or(false) {
            return Err("A debug station build is not offered to phones.".into());
        }
        let actual = sha256_hex(&apk);
        if !actual.eq_ignore_ascii_case(&sha) {
            return Err("The station APK checksum did not match.".into());
        }
        self.station_update = Some(StationApk {
            version,
            sha256: actual,
            apk,
        });
        Ok(())
    }

    pub fn station_update_manifest(&self) -> Option<Value> {
        self.station_update.as_ref().map(|update| {
            json!({
                "version": update.version,
                "url": "/sync/station-apk",
                "sha256": update.sha256,
            })
        })
    }

    pub fn station_update_apk(&self) -> Option<Vec<u8>> {
        self.station_update.as_ref().map(|update| update.apk.clone())
    }

    pub fn snapshot(&self, urls: &[String]) -> Snapshot {
        Snapshot {
            settings: WarnSetting {
                clock_offset_warn_ms: self.settings_warn_ms,
                min_pass_gap_ms: self.settings_gap_ms,
            },
            stations: self.stations.clone(),
            punches: self.punches.clone(),
            row_starts: self.row_starts.clone(),
            rider_starts: self.rider_starts.clone(),
            manual_starts: self.manual_starts.clone(),
            listening_urls: urls.to_vec(),
            hub_version: self.hub_version.clone(),
        }
    }

    pub fn seed(&mut self, stored: Option<Value>, deltas: Vec<Value>, version: &str) -> Result<(), String> {
        let incoming = match stored {
            Some(value) => serde_json::from_value::<Stored>(value).map_err(|err| err.to_string())?,
            None => Stored {
                settings: WarnSetting {
                    clock_offset_warn_ms: self.settings_warn_ms,
                    min_pass_gap_ms: self.settings_gap_ms,
                },
                stations: Vec::new(),
                punches: Vec::new(),
                row_starts: Vec::new(),
                rider_starts: Vec::new(),
                manual_starts: Vec::new(),
            },
        };
        let row_starts = merge_row_starts(incoming.row_starts.clone(), &self.row_starts);
        let rider_starts = merge_rider_starts(incoming.rider_starts.clone(), &self.rider_starts);
        let roster = parse_deltas(deltas)?;
        let mut punches = merge_punches(incoming.punches, &self.punches);
        punches = merge_punches(punches, &[]);
        let mut stations: HashMap<String, Station> = incoming
            .stations
            .into_iter()
            .map(|station| (station.pairing_id.clone(), station))
            .collect();
        for station in &self.stations {
            let replace = match stations.get(&station.pairing_id) {
                None => true,
                Some(previous) => match (&station.last_sync_at, &previous.last_sync_at) {
                    (Some(next), Some(prev)) => next > prev,
                    (Some(_), None) => true,
                    _ => false,
                },
            };
            if replace {
                stations.insert(station.pairing_id.clone(), station.clone());
            }
        }
        self.hub_version = version.to_string();
        self.settings_warn_ms = incoming.settings.clock_offset_warn_ms;
        self.settings_gap_ms = incoming.settings.min_pass_gap_ms;
        self.roster = roster;
        self.punches = punches;
        self.row_starts = row_starts;
        self.rider_starts = rider_starts;
        self.manual_starts = incoming.manual_starts;
        self.stations = stations.into_values().collect();
        Ok(())
    }

    pub fn set_roster(&mut self, deltas: Vec<Value>) -> Result<(), String> {
        self.roster = parse_deltas(deltas)?;
        Ok(())
    }

    pub fn set_clock_warn_ms(&mut self, ms: i64) -> Result<(), String> {
        if ms < 0 {
            return Err("The clock warning must be zero or more milliseconds.".into());
        }
        self.settings_warn_ms = ms;
        Ok(())
    }

    pub fn create_pairing(&mut self, input: PairingInput, now: &str) -> Result<PairingPayload, String> {
        let secret = new_secret();
        let payload = pairing_payload(self, &input, &secret, now, &trim_url(&input.hub_url));
        self.stations.push(Station {
            pairing_id: Uuid::new_v4().to_string(),
            pairing_secret: secret,
            hub_url: payload.hub_url.clone(),
            event_id: input.event_id,
            event_name: input.event_name,
            race_id: input.race_id,
            race_name: input.race_name,
            check_id: input.check_id,
            check_name: input.check_name,
            device_id: None,
            app_version: None,
            battery_percent: None,
            clock_offset_ms: None,
            last_sync_at: None,
            paired_at: now.to_string(),
            go_live_allowed: false,
            roster_version: 0,
            role: input.role.clone(),
            start_rows: input.start_rows.clone(),
        });
        Ok(payload)
    }

    pub fn show_pairing(
        &mut self,
        pairing_id: &str,
        hub_url: Option<String>,
        now: &str,
    ) -> Result<PairingPayload, String> {
        let station = self
            .stations
            .iter_mut()
            .find(|station| station.pairing_id == pairing_id)
            .ok_or_else(|| "That station is not paired.".to_string())?;
        if let Some(url) = hub_url {
            station.hub_url = trim_url(&url);
        }
        Ok(PairingPayload {
            schema_version: 1,
            kind: "station_pairing",
            hub_url: station.hub_url.clone(),
            event_id: station.event_id.clone(),
            event_name: station.event_name.clone(),
            race_id: station.race_id.clone(),
            race_name: station.race_name.clone(),
            check_id: station.check_id.clone(),
            check_name: station.check_name.clone(),
            pairing_secret: station.pairing_secret.clone(),
            laptop_now: now.to_string(),
            hub_version: self.hub_version.clone(),
            clock_offset_warn_ms: self.settings_warn_ms,
            role: station.role.clone(),
            start_rows: station.start_rows.clone(),
        })
    }

    pub fn add_punch(&mut self, punch: Value) -> Result<(), String> {
        let punch: Punch = serde_json::from_value(punch).map_err(|_| "That punch was not understood.".to_string())?;
        validate_punch(&punch)?;
        self.punches = merge_punches(self.punches.clone(), &[punch]);
        Ok(())
    }

    pub fn void_punch(&mut self, uuid: &str) -> Result<(), String> {
        let punch = self
            .punches
            .iter_mut()
            .find(|punch| punch.uuid == uuid)
            .ok_or_else(|| "That punch is not on this laptop.".to_string())?;
        punch.voided = true;
        Ok(())
    }

    pub fn import_text(&mut self, text: &str) -> Result<(), String> {
        if text.contains("qr_start_export") {
            return self.import_starts(text);
        }
        let frames = parse_frames(text)?;
        let punches = assemble_frames(&frames)?;
        self.punches = merge_punches(self.punches.clone(), &punches);
        Ok(())
    }

    fn import_starts(&mut self, text: &str) -> Result<(), String> {
        let value: Value = serde_json::from_str(text).map_err(|_| "That text is not a station QR payload.".to_string())?;
        let frames = match value {
            Value::Array(items) => items,
            other => vec![other],
        };
        for frame in frames {
            let kind = frame.get("type").and_then(Value::as_str).unwrap_or("");
            if kind != "qr_start_export" {
                return Err("That text is not a start export.".into());
            }
            let items = frame.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
            for item in items {
                let kind = item.get("kind").and_then(Value::as_str).unwrap_or("");
                if kind == "row" {
                    let start: RowStart = serde_json::from_value(item.get("start").cloned().unwrap_or(Value::Null))
                        .map_err(|_| "A row start in this QR was not understood.".to_string())?;
                    self.row_starts = merge_row_starts(self.row_starts.clone(), &[start]);
                } else if kind == "rider" {
                    let start: RiderStart = serde_json::from_value(item.get("start").cloned().unwrap_or(Value::Null))
                        .map_err(|_| "A rider start in this QR was not understood.".to_string())?;
                    self.rider_starts = merge_rider_starts(self.rider_starts.clone(), &[start]);
                }
            }
        }
        Ok(())
    }

    pub fn set_manual_start(&mut self, start: Value) -> Result<(), String> {
        let parsed: ManualStart = serde_json::from_value(start).map_err(|_| "That start was not understood.".to_string())?;
        self.manual_starts.retain(|entry| entry.rider_number != parsed.rider_number);
        self.manual_starts.push(parsed);
        Ok(())
    }

    pub fn set_row_clock(&mut self, start: Value) -> Result<(), String> {
        let parsed: RowStart = serde_json::from_value(start).map_err(|_| "That row start was not understood.".to_string())?;
        self.row_starts = merge_row_starts(self.row_starts.clone(), &[parsed]);
        Ok(())
    }

    pub fn roster_qr(&self, event_id: &str, since: i64) -> Result<Vec<String>, String> {
        let deltas: Vec<&RosterDelta> = self
            .roster
            .iter()
            .filter(|delta| delta.event_id == event_id && delta.version > since)
            .collect();
        let now = now_iso();
        encode_roster(&deltas, event_id, &now)
    }

    pub fn handle(&mut self, method: &str, path: &str, authorization: Option<&str>, body: Option<Value>, now: &str) -> HttpReply {
        let route = path.split('?').next().unwrap_or(path);
        if method.eq_ignore_ascii_case("GET") && route == "/health" {
            return HttpReply {
                status: 200,
                body: json!({ "ok": true, "app": "mwhe-laptop", "version": self.hub_version }),
            };
        }
        let secret = bearer(authorization);
        if method.eq_ignore_ascii_case("POST") && route == "/sync/pair" {
            return self.hello(secret.as_deref(), body, now);
        }
        if method.eq_ignore_ascii_case("POST") && route == "/sync/punches" {
            return self.punches(secret.as_deref(), body, now);
        }
        if method.eq_ignore_ascii_case("GET") && route == "/sync/roster" {
            return self.roster_get(secret.as_deref(), path, now);
        }
        HttpReply {
            status: 404,
            body: error_body("bad_request", "That sync address does not exist."),
        }
    }

    fn hello(&mut self, secret: Option<&str>, body: Option<Value>, now: &str) -> HttpReply {
        let Some(index) = self.find_station(secret) else {
            return unauthorized();
        };
        let Ok(hello) = serde_json::from_value::<Hello>(body.unwrap_or(Value::Null)) else {
            return bad("The phone's check-in was not understood.");
        };
        if hello.schema_version != 1 || hello.kind != "station_hello" {
            return bad("The phone's check-in was not understood.");
        }
        let station = &self.stations[index];
        if hello.event_id != station.event_id || hello.race_id != station.race_id || hello.check_id != station.check_id {
            return conflict("This code was made for a different check.");
        }
        if station.device_id.as_deref().is_some_and(|id| id != hello.device_id) {
            return conflict("This pairing is already used by another phone.");
        }
        let Ok(offset) = clock_offset(&hello.device_now, now) else {
            return bad("The phone clock could not be read.");
        };
        let allowed = versions_match(&self.hub_version, &hello.app_version);
        let event_id = self.stations[index].event_id.clone();
        let deltas = self.deltas_since(&event_id, hello.roster_version);
        let station = &mut self.stations[index];
        station.device_id = Some(hello.device_id);
        station.app_version = Some(hello.app_version);
        if hello.battery_percent.is_some() {
            station.battery_percent = hello.battery_percent;
        }
        station.clock_offset_ms = Some(offset);
        station.last_sync_at = Some(now.to_string());
        station.go_live_allowed = allowed;
        station.roster_version = hello.roster_version;
        HttpReply {
            status: 200,
            body: json!({
                "schemaVersion": 1,
                "type": "station_hello_ack",
                "laptopNow": now,
                "clockOffsetMs": offset,
                "goLiveAllowed": allowed,
                "reason": if allowed { Value::Null } else { json!("app_version_mismatch") },
                "hubVersion": self.hub_version,
                "rosterDeltas": deltas,
                "clockOffsetWarnMs": self.settings_warn_ms,
            }),
        }
    }

    fn punches(&mut self, secret: Option<&str>, body: Option<Value>, now: &str) -> HttpReply {
        let Some(index) = self.find_station(secret) else {
            return unauthorized();
        };
        let Ok(message) = serde_json::from_value::<Push>(body.unwrap_or(Value::Null)) else {
            return bad("The punch upload was not understood.");
        };
        if message.schema_version != 1 || message.kind != "push_punches" || message.sent_at.is_empty() {
            return bad("The punch upload was not understood.");
        }
        let station = &self.stations[index];
        if message.event_id != station.event_id {
            return conflict("These punches are for a different event.");
        }
        if message.race_id.as_ref().is_some_and(|id| id != &station.race_id) {
            return conflict("These punches are for a different race.");
        }
        if message.check_id.as_ref().is_some_and(|id| id != &station.check_id) {
            return conflict("These punches are for a different check.");
        }
        if station.device_id.as_deref().is_some_and(|id| id != message.device_id) {
            return conflict("This pairing is already used by another phone.");
        }
        for punch in &message.punches {
            if let Err(message) = validate_punch(punch) {
                return bad(&message);
            }
            if punch.device_id != message.device_id {
                return bad("A punch in this upload is from a different phone.");
            }
            if punch.check_id != self.stations[index].check_id {
                return bad("A punch in this upload is for a different check.");
            }
        }
        let (punches, accepted, duplicates, voids_applied) = merge_counts(&self.punches, &message.punches);
        self.punches = punches;
        self.row_starts = merge_row_starts(self.row_starts.clone(), &message.row_starts);
        self.rider_starts = merge_rider_starts(self.rider_starts.clone(), &message.rider_starts);
        let app_version = message.app_version.clone().or_else(|| self.stations[index].app_version.clone());
        let allowed = app_version
            .as_ref()
            .map(|version| versions_match(&self.hub_version, version))
            .unwrap_or(self.stations[index].go_live_allowed);
        let offset = if let Some(device_now) = &message.device_now {
            match clock_offset(device_now, now) {
                Ok(value) => value,
                Err(()) => return bad("The phone clock could not be read."),
            }
        } else {
            self.stations[index].clock_offset_ms.unwrap_or(0)
        };
        let since = message.roster_version.unwrap_or(self.stations[index].roster_version);
        let event_id = self.stations[index].event_id.clone();
        let deltas = self.deltas_since(&event_id, since);
        let station = &mut self.stations[index];
        station.device_id = Some(message.device_id);
        station.app_version = app_version.clone();
        if message.battery_percent.is_some() {
            station.battery_percent = message.battery_percent;
        }
        if message.device_now.is_some() {
            station.clock_offset_ms = Some(offset);
        }
        station.last_sync_at = Some(now.to_string());
        station.go_live_allowed = allowed;
        if let Some(version) = message.roster_version {
            station.roster_version = version;
        }
        HttpReply {
            status: 200,
            body: json!({
                "schemaVersion": 1,
                "type": "sync_result",
                "laptopNow": now,
                "clockOffsetMs": offset,
                "accepted": accepted,
                "duplicates": duplicates,
                "voidsApplied": voids_applied,
                "rosterDeltas": deltas,
                "goLiveAllowed": allowed,
                "hubVersion": self.hub_version,
                "reason": if app_version.is_some() && !allowed { json!("app_version_mismatch") } else { Value::Null },
                "clockOffsetWarnMs": self.settings_warn_ms,
            }),
        }
    }

    fn roster_get(&mut self, secret: Option<&str>, path: &str, now: &str) -> HttpReply {
        let Some(index) = self.find_station(secret) else {
            return unauthorized();
        };
        let Some(since) = query_since(path) else {
            return bad("Roster sync needs a since version.");
        };
        let deltas = self.deltas_since(&self.stations[index].event_id, since);
        let station = &mut self.stations[index];
        station.roster_version = since;
        station.last_sync_at = Some(now.to_string());
        HttpReply {
            status: 200,
            body: json!({
                "schemaVersion": 1,
                "type": "roster_sync",
                "laptopNow": now,
                "rosterDeltas": deltas,
            }),
        }
    }

    fn find_station(&self, secret: Option<&str>) -> Option<usize> {
        let secret = secret?;
        self.stations.iter().position(|station| secrets_match(&station.pairing_secret, secret))
    }

    fn deltas_since(&self, event_id: &str, since: i64) -> Vec<RosterDelta> {
        self.roster
            .iter()
            .filter(|delta| delta.event_id == event_id && delta.version > since)
            .cloned()
            .collect()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Hello {
    schema_version: u8,
    #[serde(rename = "type")]
    kind: String,
    device_id: String,
    event_id: String,
    race_id: String,
    check_id: String,
    app_version: String,
    device_now: String,
    #[serde(default)]
    battery_percent: Option<i64>,
    roster_version: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Push {
    schema_version: u8,
    #[serde(rename = "type")]
    kind: String,
    device_id: String,
    event_id: String,
    sent_at: String,
    punches: Vec<Punch>,
    #[serde(default)]
    race_id: Option<String>,
    #[serde(default)]
    check_id: Option<String>,
    #[serde(default)]
    app_version: Option<String>,
    #[serde(default)]
    battery_percent: Option<i64>,
    #[serde(default)]
    roster_version: Option<i64>,
    #[serde(default)]
    device_now: Option<String>,
    #[serde(default)]
    row_starts: Vec<RowStart>,
    #[serde(default)]
    rider_starts: Vec<RiderStart>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    settings: WarnSetting,
    stations: Vec<Station>,
    punches: Vec<Punch>,
    #[serde(default)]
    row_starts: Vec<RowStart>,
    #[serde(default)]
    rider_starts: Vec<RiderStart>,
    #[serde(default)]
    manual_starts: Vec<ManualStart>,
}

impl<'de> Deserialize<'de> for WarnSetting {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Raw {
            clock_offset_warn_ms: i64,
            #[serde(default = "default_gap")]
            min_pass_gap_ms: i64,
        }
        fn default_gap() -> i64 {
            120_000
        }
        let raw = Raw::deserialize(deserializer)?;
        Ok(WarnSetting {
            clock_offset_warn_ms: raw.clock_offset_warn_ms,
            min_pass_gap_ms: raw.min_pass_gap_ms,
        })
    }
}

fn parse_deltas(deltas: Vec<Value>) -> Result<Vec<RosterDelta>, String> {
    let mut parsed = Vec::new();
    for (index, value) in deltas.into_iter().enumerate() {
        let delta: RosterDelta = serde_json::from_value(value).map_err(|_| "A roster delta was not understood.".to_string())?;
        if delta.schema_version != 1 || delta.kind != "roster_delta" {
            return Err("A roster delta was not understood.".into());
        }
        if delta.version != index as i64 + 1 || delta.base_version != index as i64 {
            return Err("Roster deltas must be a contiguous sequence from version 1.".into());
        }
        parsed.push(delta);
    }
    let mut events = parsed.iter().map(|delta| delta.event_id.as_str());
    if let Some(first) = events.next() {
        if events.any(|event| event != first) {
            return Err("Roster deltas must belong to one event.".into());
        }
    }
    Ok(parsed)
}

fn validate_punch(punch: &Punch) -> Result<(), String> {
    if punch.schema_version != 1 || punch.rider_number < 1 || punch.uuid.is_empty() {
        return Err("A punch in this upload was not understood.".into());
    }
    Ok(())
}

fn merge_punches(existing: Vec<Punch>, incoming: &[Punch]) -> Vec<Punch> {
    merge_counts(&existing, incoming).0
}

fn merge_counts(existing: &[Punch], incoming: &[Punch]) -> (Vec<Punch>, i64, i64, i64) {
    let mut punches = existing.to_vec();
    let mut index: HashMap<String, usize> = punches
        .iter()
        .enumerate()
        .map(|(position, punch)| (punch.uuid.clone(), position))
        .collect();
    let mut accepted = 0;
    let mut duplicates = 0;
    let mut voids_applied = 0;
    for punch in incoming {
        if let Some(at) = index.get(&punch.uuid).copied() {
            if punch.voided && !punches[at].voided {
                punches[at].voided = true;
                voids_applied += 1;
            } else {
                duplicates += 1;
            }
        } else {
            index.insert(punch.uuid.clone(), punches.len());
            punches.push(punch.clone());
            accepted += 1;
        }
    }
    (punches, accepted, duplicates, voids_applied)
}

fn pairing_payload(hub: &Hub, input: &PairingInput, secret: &str, now: &str, hub_url: &str) -> PairingPayload {
    PairingPayload {
        schema_version: 1,
        kind: "station_pairing",
        hub_url: hub_url.to_string(),
        event_id: input.event_id.clone(),
        event_name: input.event_name.clone(),
        race_id: input.race_id.clone(),
        race_name: input.race_name.clone(),
        check_id: input.check_id.clone(),
        check_name: input.check_name.clone(),
        pairing_secret: secret.to_string(),
        laptop_now: now.to_string(),
        hub_version: hub.hub_version.clone(),
        clock_offset_warn_ms: hub.settings_warn_ms,
        role: input.role.clone(),
        start_rows: input.start_rows.clone(),
    }
}

fn merge_row_starts(existing: Vec<RowStart>, incoming: &[RowStart]) -> Vec<RowStart> {
    let mut starts = existing;
    for start in incoming {
        if let Some(found) = starts.iter_mut().find(|entry| entry.uuid == start.uuid) {
            if start.voided {
                found.voided = true;
            }
        } else {
            starts.push(start.clone());
        }
    }
    starts
}

fn merge_rider_starts(existing: Vec<RiderStart>, incoming: &[RiderStart]) -> Vec<RiderStart> {
    let mut starts = existing;
    for start in incoming {
        if let Some(found) = starts.iter_mut().find(|entry| entry.uuid == start.uuid) {
            if start.voided {
                found.voided = true;
            }
        } else {
            starts.push(start.clone());
        }
    }
    starts
}

pub fn decode_apk_base64(value: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(value.trim())
        .map_err(|_| "The station APK was not valid base64.".to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect()
}

fn new_secret() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("pairing secret");
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn hub_now() -> String {
    now_iso()
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn trim_url(url: &str) -> String {
    url.trim_end_matches('/').to_string()
}

fn versions_match(hub: &str, station: &str) -> bool {
    normalize_version(hub) == normalize_version(station)
}

fn normalize_version(version: &str) -> &str {
    let trimmed = version.trim();
    match trimmed.strip_prefix('v') {
        Some(rest) if rest.starts_with(|ch: char| ch.is_ascii_digit()) => rest,
        _ => trimmed,
    }
}

fn clock_offset(device_now: &str, laptop_now: &str) -> Result<i64, ()> {
    let device = DateTime::parse_from_rfc3339(device_now).map_err(|_| ())?;
    let laptop = DateTime::parse_from_rfc3339(laptop_now).map_err(|_| ())?;
    Ok((device - laptop).num_milliseconds())
}

fn secrets_match(left: &str, right: &str) -> bool {
    let (left, right) = (left.as_bytes(), right.as_bytes());
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

fn bearer(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    let rest = value
        .strip_prefix("Bearer ")
        .or_else(|| value.strip_prefix("bearer "))?;
    Some(rest.trim().to_string())
}

fn query_since(path: &str) -> Option<i64> {
    let query = path.split_once('?')?.1;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=')?;
        if key == "since" && !value.is_empty() && value.chars().all(|ch| ch.is_ascii_digit()) {
            return value.parse().ok();
        }
    }
    None
}

fn unauthorized() -> HttpReply {
    HttpReply {
        status: 401,
        body: error_body("unauthorized", "This pairing code is not on the laptop."),
    }
}

fn bad(message: &str) -> HttpReply {
    HttpReply {
        status: 400,
        body: error_body("bad_request", message),
    }
}

fn conflict(message: &str) -> HttpReply {
    HttpReply {
        status: 409,
        body: error_body("conflict", message),
    }
}

fn error_body(error: &str, message: &str) -> Value {
    json!({
        "schemaVersion": 1,
        "type": "sync_error",
        "error": error,
        "message": message,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QrPunch {
    uuid: String,
    rider_number: i64,
    timestamp: String,
    created_at: String,
    voided: bool,
    #[serde(default)]
    clock_offset_ms: Option<i64>,
    #[serde(default)]
    unknown_number: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QrFrame {
    schema_version: u8,
    #[serde(rename = "type")]
    kind: String,
    event_id: String,
    #[serde(default)]
    race_id: Option<String>,
    check_id: String,
    device_id: String,
    exported_at: String,
    part: i64,
    parts: i64,
    punches: Vec<QrPunch>,
}

fn parse_frames(text: &str) -> Result<Vec<QrFrame>, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Paste a QR payload first.".into());
    }
    let values = if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        match value {
            Value::Array(items) => items,
            other => vec![other],
        }
    } else {
        trimmed
            .split("\n\n")
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .map(|part| serde_json::from_str(part).map_err(|_| "That text is not a station QR payload.".to_string()))
            .collect::<Result<Vec<_>, _>>()?
    };
    values
        .into_iter()
        .map(|value| serde_json::from_value(value).map_err(|_| "That text is not a station QR payload.".to_string()))
        .collect()
}

fn assemble_frames(frames: &[QrFrame]) -> Result<Vec<Punch>, String> {
    let first = frames.first().ok_or_else(|| "No QR frames.".to_string())?;
    if first.kind != "qr_checkpoint_export" || first.schema_version != 1 {
        return Err("That text is not a station QR payload.".into());
    }
    if frames.iter().any(|frame| {
        frame.event_id != first.event_id
            || frame.check_id != first.check_id
            || frame.device_id != first.device_id
            || frame.exported_at != first.exported_at
            || frame.parts != first.parts
    }) {
        return Err("These QR codes are not from the same export.".into());
    }
    let mut seen = HashMap::new();
    for frame in frames {
        if seen.insert(frame.part, frame).is_some() {
            return Err(format!("QR part {} was included twice.", frame.part));
        }
    }
    let mut missing = Vec::new();
    for part in 1..=first.parts {
        if !seen.contains_key(&part) {
            missing.push(part.to_string());
        }
    }
    if !missing.is_empty() {
        return Err(format!(
            "QR part {} of {} is still missing.",
            missing.join(", "),
            first.parts
        ));
    }
    let mut punches = Vec::new();
    for part in 1..=first.parts {
        let frame = seen[&part];
        for punch in &frame.punches {
            punches.push(Punch {
                schema_version: frame.schema_version,
                uuid: punch.uuid.clone(),
                check_id: frame.check_id.clone(),
                device_id: frame.device_id.clone(),
                rider_number: punch.rider_number,
                timestamp: punch.timestamp.clone(),
                created_at: punch.created_at.clone(),
                voided: punch.voided,
                event_id: Some(frame.event_id.clone()),
                race_id: frame.race_id.clone(),
                clock_offset_ms: punch.clock_offset_ms,
                unknown_number: punch.unknown_number,
            });
        }
    }
    Ok(punches)
}

fn encode_roster(deltas: &[&RosterDelta], event_id: &str, exported_at: &str) -> Result<Vec<String>, String> {
    let items: Vec<RosterDelta> = deltas.iter().map(|delta| (*delta).clone()).collect();
    let mut chunks: Vec<Vec<RosterDelta>> = Vec::new();
    if items.is_empty() {
        chunks.push(Vec::new());
    }
    let mut cursor = 0;
    while cursor < items.len() {
        let mut take = 1;
        while cursor + take < items.len() && frame_len(&items[cursor..cursor + take + 1], event_id, exported_at) <= QR_CHUNK_MAX_CHARS {
            take += 1;
        }
        chunks.push(items[cursor..cursor + take].to_vec());
        cursor += take;
    }
    let parts = chunks.len() as i64;
    Ok(chunks
        .iter()
        .enumerate()
        .map(|(index, slice)| serde_json::to_string(&roster_frame(slice, event_id, exported_at, index as i64 + 1, parts)).unwrap())
        .collect())
}

fn frame_len(slice: &[RosterDelta], event_id: &str, exported_at: &str) -> usize {
    serde_json::to_string(&roster_frame(slice, event_id, exported_at, 99, 99))
        .map(|text| text.len())
        .unwrap_or(usize::MAX)
}

fn roster_frame(slice: &[RosterDelta], event_id: &str, exported_at: &str, part: i64, parts: i64) -> Value {
    json!({
        "schemaVersion": 1,
        "type": "qr_roster_export",
        "eventId": event_id,
        "exportedAt": exported_at,
        "part": part,
        "parts": parts,
        "deltas": slice,
    })
}

pub fn lan_urls(port: u16) -> Vec<String> {
    let mut urls = vec![format!("http://127.0.0.1:{port}")];
    if let Ok(list) = if_addrs::get_if_addrs() {
        for iface in list {
            if iface.is_loopback() {
                continue;
            }
            let std::net::IpAddr::V4(ip) = iface.ip() else {
                continue;
            };
            if ip.is_link_local() || ip.is_unspecified() {
                continue;
            }
            urls.push(format!("http://{ip}:{port}"));
        }
    }
    urls
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secret() -> &'static str {
        "ab".repeat(32).leak()
    }

    fn station(secret: &str) -> Station {
        Station {
            pairing_id: "00000000-0000-4000-8000-0000000000a1".into(),
            pairing_secret: secret.into(),
            hub_url: "http://127.0.0.1:8788".into(),
            event_id: "evt-1".into(),
            event_name: "Gnaw Bone".into(),
            race_id: "race-1".into(),
            race_name: "Championship".into(),
            check_id: "cp1".into(),
            check_name: "CP1".into(),
            device_id: None,
            app_version: None,
            battery_percent: None,
            clock_offset_ms: None,
            last_sync_at: None,
            paired_at: "2026-06-14T15:00:00.000Z".into(),
            go_live_allowed: false,
            roster_version: 0,
            role: "check".into(),
            start_rows: Vec::new(),
        }
    }

    #[test]
    fn wrong_secret_is_rejected_without_echoing_it() {
        let mut hub = Hub::new("0.3.0");
        hub.stations.push(station(secret()));
        let reply = hub.handle("POST", "/sync/pair", Some("Bearer nope"), None, "2026-06-14T15:00:00.000Z");
        assert_eq!(reply.status, 401);
        let body = reply.body.to_string();
        assert!(!body.contains(secret()));
    }

    #[test]
    fn version_mismatch_blocks_go_live_and_a_later_void_wins() {
        let mut hub = Hub::new("0.3.0");
        hub.stations.push(station(secret()));
        let hello = json!({
            "schemaVersion": 1,
            "type": "station_hello",
            "deviceId": "phone-1",
            "eventId": "evt-1",
            "raceId": "race-1",
            "checkId": "cp1",
            "appVersion": "0.2.1",
            "deviceNow": "2026-06-14T15:00:02.000Z",
            "batteryPercent": 64,
            "rosterVersion": 0
        });
        let reply = hub.handle(
            "POST",
            "/sync/pair",
            Some(&format!("Bearer {}", secret())),
            Some(hello),
            "2026-06-14T15:00:00.000Z",
        );
        assert_eq!(reply.status, 200);
        assert_eq!(reply.body["goLiveAllowed"], false);
        assert_eq!(reply.body["reason"], "app_version_mismatch");
        assert_eq!(reply.body["clockOffsetMs"], 2000);

        let punch = json!({
            "schemaVersion": 1,
            "uuid": "00000000-0000-4000-8000-000000000099",
            "checkId": "cp1",
            "deviceId": "phone-1",
            "riderNumber": 999,
            "timestamp": "2026-06-14T15:10:00.000Z",
            "createdAt": "2026-06-14T15:10:00.000Z",
            "voided": false,
            "unknownNumber": true
        });
        let push = json!({
            "schemaVersion": 1,
            "type": "push_punches",
            "deviceId": "phone-1",
            "eventId": "evt-1",
            "sentAt": "2026-06-14T15:10:00.000Z",
            "appVersion": "0.2.1",
            "punches": [punch]
        });
        let stored = hub.handle(
            "POST",
            "/sync/punches",
            Some(&format!("Bearer {}", secret())),
            Some(push.clone()),
            "2026-06-14T15:10:00.000Z",
        );
        assert_eq!(stored.body["accepted"], 1);
        assert_eq!(stored.body["goLiveAllowed"], false);
        assert_eq!(hub.punches.len(), 1);

        let mut voided = push;
        voided["punches"][0]["voided"] = json!(true);
        let again = hub.handle(
            "POST",
            "/sync/punches",
            Some(&format!("Bearer {}", secret())),
            Some(voided),
            "2026-06-14T15:10:00.000Z",
        );
        assert_eq!(again.body["voidsApplied"], 1);
        assert!(hub.punches[0].voided);
    }

    #[test]
    fn a_contact_field_is_rejected() {
        let mut hub = Hub::new("0.3.0");
        hub.stations.push(station(secret()));
        let reply = hub.handle(
            "POST",
            "/sync/punches",
            Some(&format!("Bearer {}", secret())),
            Some(json!({
                "schemaVersion": 1,
                "type": "push_punches",
                "deviceId": "phone-1",
                "eventId": "evt-1",
                "sentAt": "2026-06-14T15:10:00.000Z",
                "email": "rider@example.com",
                "punches": []
            })),
            "2026-06-14T15:10:00.000Z",
        );
        assert_eq!(reply.status, 400);
        assert!(!reply.body.to_string().contains("rider@example.com"));
    }

    #[test]
    fn versions_ignore_a_leading_v_only() {
        assert!(versions_match("0.3.0", "v0.3.0"));
        assert!(!versions_match("0.3.0", "0.3.1"));
        assert!(!versions_match("0.3.0", "0.3.0-rc.1"));
    }

    #[test]
    fn a_station_apk_is_served_only_when_the_checksum_matches() {
        let mut hub = Hub::new("0.4.0");
        let apk = b"abc".to_vec();
        let sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        let bad = hub.set_station_update(
            json!({"version": "0.4.0", "url": "https://example.test/a.apk", "sha256": "ab".repeat(32)}),
            apk.clone(),
        );
        assert!(bad.is_err());
        assert!(hub.station_update_manifest().is_none());
        hub.set_station_update(
            json!({"version": "0.4.0", "url": "https://example.test/a.apk", "sha256": sha}),
            apk.clone(),
        )
        .unwrap();
        let manifest = hub.station_update_manifest().unwrap();
        assert_eq!(manifest["url"], "/sync/station-apk");
        assert_eq!(manifest["sha256"], sha);
        assert_eq!(hub.station_update_apk().unwrap(), apk);
    }
}
