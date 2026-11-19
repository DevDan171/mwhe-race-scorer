use keyring::Entry;

const SERVICE: &str = "MWHE Race Scorer";
const ACCOUNT: &str = "site-bearer-token";
/// AES-256 key for rider contact fields. Not the sign-in token.
const VAULT_ACCOUNT: &str = "rider-private-key";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|err| err.to_string())
}

fn vault_entry() -> Result<Entry, String> {
    Entry::new(SERVICE, VAULT_ACCOUNT).map_err(|err| err.to_string())
}

/// Target name `keyring` 3 writes into Windows Credential Manager.
/// The default Windows store joins account and service as `{account}.{service}`.
/// `windows/hooks.nsh` deletes these only when uninstall is asked to delete app data.
pub(crate) fn windows_credential_target(account: &str) -> String {
    format!("{account}.{SERVICE}")
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
pub(crate) fn credential_get_vault() -> Result<Option<String>, String> {
    match vault_entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub(crate) fn credential_set_vault(value: String) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Vault key is empty".to_string());
    }
    vault_entry()?
        .set_password(trimmed)
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::{windows_credential_target, ACCOUNT, VAULT_ACCOUNT};

    #[test]
    fn windows_targets_match_the_uninstaller() {
        assert_eq!(
            windows_credential_target(ACCOUNT),
            "site-bearer-token.MWHE Race Scorer"
        );
        assert_eq!(
            windows_credential_target(VAULT_ACCOUNT),
            "rider-private-key.MWHE Race Scorer"
        );
    }
}

#[tauri::command]
pub(crate) fn credential_clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}
