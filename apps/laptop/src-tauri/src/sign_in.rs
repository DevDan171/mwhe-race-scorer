use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

/// One Google sign-in at a time. The page on the website redirects the browser
/// at this loopback URL with a one-time code and the state the laptop created.
/// A token on the URL fails the attempt and is not copied into the error.
const WAIT: Duration = Duration::from_secs(600);

struct Pending {
    cancel: Sender<()>,
    events: Receiver<CallbackEvent>,
}

enum CallbackEvent {
    Code(String),
    Failed(String),
}

static PENDING: Mutex<Option<Pending>> = Mutex::new(None);

#[tauri::command]
pub(crate) fn open_sign_in_page(url: String) -> Result<(), String> {
    validate_page_url(&url)?;
    open_browser(&url)
}

#[tauri::command]
pub(crate) fn start_sign_in_callback(state: String) -> Result<u16, String> {
    if !is_state(&state) {
        return Err("Sign-in could not be started. Try again.".to_string());
    }
    cancel_sign_in_callback()?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| {
        "The laptop could not listen for the Google sign-in. Type the code instead.".to_string()
    })?;
    listener
        .set_nonblocking(true)
        .map_err(|err| err.to_string())?;
    let port = listener.local_addr().map_err(|err| err.to_string())?.port();
    let (cancel_tx, cancel_rx) = mpsc::channel();
    let (event_tx, event_rx) = mpsc::channel();
    let expected = state;
    thread::spawn(move || listen(listener, expected, cancel_rx, event_tx));
    let mut slot = PENDING
        .lock()
        .map_err(|_| "Sign-in could not be started. Try again.".to_string())?;
    *slot = Some(Pending {
        cancel: cancel_tx,
        events: event_rx,
    });
    Ok(port)
}

#[tauri::command]
pub(crate) fn wait_sign_in_callback() -> Result<String, String> {
    let events = {
        let mut slot = PENDING
            .lock()
            .map_err(|_| "Google sign-in did not finish.".to_string())?;
        let pending = slot
            .take()
            .ok_or_else(|| "Google sign-in is not waiting.".to_string())?;
        // Keep the cancel sender alive until this wait ends by parking it.
        let events = pending.events;
        *slot = Some(Pending {
            cancel: pending.cancel,
            events: mpsc::channel().1,
        });
        events
    };
    match events.recv_timeout(WAIT) {
        Ok(CallbackEvent::Code(code)) => {
            let _ = cancel_sign_in_callback();
            Ok(code)
        }
        Ok(CallbackEvent::Failed(message)) => {
            let _ = cancel_sign_in_callback();
            Err(message)
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            let _ = cancel_sign_in_callback();
            Err(
                "Google sign-in did not finish. Type the code from the browser, or try again."
                    .to_string(),
            )
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            Err("Google sign-in did not finish. Try again.".to_string())
        }
    }
}

#[tauri::command]
pub(crate) fn cancel_sign_in_callback() -> Result<(), String> {
    let mut slot = PENDING
        .lock()
        .map_err(|_| "Sign-in could not be cancelled.".to_string())?;
    if let Some(pending) = slot.take() {
        let _ = pending.cancel.send(());
    }
    Ok(())
}

fn listen(
    listener: TcpListener,
    state: String,
    cancel: Receiver<()>,
    events: Sender<CallbackEvent>,
) {
    let deadline = Instant::now() + WAIT;
    let mut requests = 0;
    loop {
        if cancel.try_recv().is_ok() || Instant::now() >= deadline {
            let _ = events.send(CallbackEvent::Failed(
                "Google sign-in did not finish. Type the code from the browser, or try again."
                    .to_string(),
            ));
            return;
        }
        match listener.accept() {
            Ok((stream, address)) => {
                if !address.ip().is_loopback() {
                    continue;
                }
                requests += 1;
                if requests > 20 {
                    let _ = events.send(CallbackEvent::Failed(
                        "Google sign-in did not finish. Try again.".to_string(),
                    ));
                    return;
                }
                match read_callback(stream, &state) {
                    CallbackRead::Continue => {}
                    CallbackRead::Code(code) => {
                        let _ = events.send(CallbackEvent::Code(code));
                        return;
                    }
                    CallbackRead::Failed(message) => {
                        let _ = events.send(CallbackEvent::Failed(message));
                        return;
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(50));
            }
            Err(_) => {
                let _ = events.send(CallbackEvent::Failed(
                    "Google sign-in did not finish. Try again.".to_string(),
                ));
                return;
            }
        }
    }
}

enum CallbackRead {
    Continue,
    Code(String),
    Failed(String),
}

fn read_callback(mut stream: TcpStream, expected_state: &str) -> CallbackRead {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let mut buffer = [0_u8; 8192];
    let mut read = 0;
    while read < buffer.len() {
        match stream.read(&mut buffer[read..]) {
            Ok(0) => break,
            Ok(count) => {
                read += count;
                if buffer[..read]
                    .windows(4)
                    .any(|window| window == b"\r\n\r\n")
                {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    let text = String::from_utf8_lossy(&buffer[..read]);
    let request = text.lines().next().unwrap_or("");
    let mut parts = request.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("");
    if method != "GET" {
        let _ = respond(
            &mut stream,
            405,
            "This sign-in did not finish. Return to MWHE Race Scorer and try again.",
        );
        return CallbackRead::Continue;
    }
    let path = target.split('?').next().unwrap_or("");
    if path != "/callback" {
        let _ = respond(
            &mut stream,
            404,
            "This page is only for MWHE Race Scorer sign-in.",
        );
        return CallbackRead::Continue;
    }
    let query = target.split_once('?').map(|(_, query)| query).unwrap_or("");
    if query_has(query, "access_token") {
        let _ = respond(
            &mut stream,
            400,
            "This sign-in did not finish. Return to MWHE Race Scorer and try again.",
        );
        return CallbackRead::Failed(
            "The sign-in page tried to send a token. Try again from the laptop.".to_string(),
        );
    }
    let code = query_value(query, "code").unwrap_or_default();
    let state = query_value(query, "state").unwrap_or_default();
    let normalized = normalize_code(&code);
    if normalized.is_empty() || state.is_empty() {
        let _ = respond(
            &mut stream,
            400,
            "This sign-in did not finish. Return to MWHE Race Scorer and try again.",
        );
        return CallbackRead::Continue;
    }
    if state != expected_state || !is_state(&state) {
        let _ = respond(
            &mut stream,
            400,
            "This sign-in did not finish. Return to MWHE Race Scorer and try again.",
        );
        return CallbackRead::Failed(
            "The sign-in page did not match this attempt. Try again.".to_string(),
        );
    }
    let _ = respond(
        &mut stream,
        200,
        "Signed in. You can close this window and return to MWHE Race Scorer.",
    );
    CallbackRead::Code(normalized)
}

fn respond(stream: &mut TcpStream, status: u16, sentence: &str) -> std::io::Result<()> {
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>MWHE Race Scorer</title></head><body><p>{}</p></body></html>",
        sentence
    );
    let reason = if status == 200 { "OK" } else { "Error" };
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(body.as_bytes())?;
    let _ = stream.flush();
    Ok(())
}

fn query_has(query: &str, key: &str) -> bool {
    query.split('&').any(|pair| {
        let name = pair.split_once('=').map(|(name, _)| name).unwrap_or(pair);
        name == key
    })
}

fn query_value(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        let (name, value) = pair.split_once('=').unwrap_or((pair, ""));
        if name == key {
            return Some(percent_decode(value));
        }
    }
    None
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn normalize_code(value: &str) -> String {
    let compact: String = value
        .chars()
        .filter(|character| !character.is_whitespace() && *character != '-')
        .flat_map(|character| character.to_uppercase())
        .collect();
    if compact.len() != 8 {
        return String::new();
    }
    const ALPHABET: &str = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    if compact
        .chars()
        .all(|character| ALPHABET.contains(character))
    {
        compact
    } else {
        String::new()
    }
}

fn is_state(value: &str) -> bool {
    let length = value.len();
    (43..=128).contains(&length)
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn validate_page_url(url: &str) -> Result<(), String> {
    if url.len() > 2048
        || url
            .chars()
            .any(|character| character.is_control() || character == '"' || character == '\\')
    {
        return Err("Sign-in page URL is not allowed.".to_string());
    }
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .ok_or_else(|| "Sign-in page must be http or https.".to_string())?;
    if rest.is_empty() || rest.starts_with('/') {
        return Err("Sign-in page must be http or https.".to_string());
    }
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.contains('@') {
        return Err("Sign-in page URL is not allowed.".to_string());
    }
    if url.to_ascii_lowercase().contains("access_token=") {
        return Err("Refusing to open a sign-in page that already has a token.".to_string());
    }
    Ok(())
}

fn open_browser(url: &str) -> Result<(), String> {
    let mut command = browser_command(url);
    command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|_| {
            "The laptop could not open the browser. Use the link on Race Prep.".to_string()
        })
}

#[cfg(target_os = "windows")]
fn browser_command(url: &str) -> std::process::Command {
    let mut command = std::process::Command::new("cmd");
    command.arg("/C").arg(format!("start \"\" \"{url}\""));
    command
}

#[cfg(target_os = "macos")]
fn browser_command(url: &str) -> std::process::Command {
    let mut command = std::process::Command::new("open");
    command.arg(url);
    command
}

#[cfg(all(unix, not(target_os = "macos")))]
fn browser_command(url: &str) -> std::process::Command {
    let mut command = std::process::Command::new("xdg-open");
    command.arg(url);
    command
}

#[cfg(test)]
mod tests {
    use super::{is_state, normalize_code, query_has, query_value, validate_page_url};

    #[test]
    fn callback_query_keeps_the_code_and_detects_a_token_key() {
        let query = "code=ABCD-EFGH&state=abc";
        assert_eq!(query_value(query, "code").as_deref(), Some("ABCD-EFGH"));
        assert_eq!(normalize_code(" abcd-efgh "), "ABCDEFGH");
        assert!(query_has(
            "code=ABCD-EFGH&access_token=present",
            "access_token"
        ));
        assert!(!query_has(query, "access_token"));
        let failure = "The sign-in page tried to send a token. Try again from the laptop.";
        assert!(!failure.contains("access_token"));
    }

    #[test]
    fn page_url_must_be_http_and_must_not_already_carry_a_token() {
        assert!(validate_page_url("https://midwesthardenduro.com/laptop-signin?state=abc").is_ok());
        assert!(validate_page_url("http://127.0.0.1:8787/laptop-signin?state=abc").is_ok());
        assert!(validate_page_url("https://evil.test/laptop-signin?access_token=abc").is_err());
        assert!(validate_page_url("javascript:alert(1)").is_err());
        assert!(validate_page_url("https://user@midwesthardenduro.com/").is_err());
        assert!(is_state(&"a".repeat(43)));
        assert!(!is_state("short"));
    }
}
