use keyring::Entry;

const SERVICE: &str = "MWHE Race Scorer";
const ACCOUNT: &str = "site-bearer-token";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|err| err.to_string())
}

#[tauri::command]
pub(crate) fn credential_get() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub(crate) fn credential_set(token: String) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("Token is empty".to_string());
    }
    entry()?.set_password(trimmed).map_err(|err| err.to_string())
}

#[tauri::command]
pub(crate) fn credential_clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}
