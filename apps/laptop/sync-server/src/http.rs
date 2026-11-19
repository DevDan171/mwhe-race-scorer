use std::net::SocketAddr;

use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::Value;
use tokio::net::TcpListener;

use crate::hub::{now_iso, HttpReply};
use crate::SharedHub;

pub fn router(hub: SharedHub) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/sync/pair", post(pair))
        .route("/sync/punches", post(punches))
        .route("/sync/roster", get(roster))
        .layer(middleware::from_fn(cors))
        .with_state(hub)
}

pub async fn listen(hub: SharedHub, port: u16) -> std::io::Result<SocketAddr> {
    let listener = TcpListener::bind(("0.0.0.0", port)).await?;
    let address = listener.local_addr()?;
    let app = router(hub);
    tokio::spawn(async move {
        axum::serve(listener, app).await.ok();
    });
    Ok(address)
}

async fn health(State(hub): State<SharedHub>) -> Response {
    let reply = hub.write().await.handle("GET", "/health", None, None, &now_iso());
    reply_response(reply)
}

async fn pair(State(hub): State<SharedHub>, headers: HeaderMap, body: Option<Json<Value>>) -> Response {
    let mut hub = hub.write().await;
    let reply = hub.handle(
        "POST",
        "/sync/pair",
        authorization(&headers),
        body.map(|Json(value)| value),
        &now_iso(),
    );
    reply_response(reply)
}

async fn punches(State(hub): State<SharedHub>, headers: HeaderMap, body: Option<Json<Value>>) -> Response {
    let mut hub = hub.write().await;
    let reply = hub.handle(
        "POST",
        "/sync/punches",
        authorization(&headers),
        body.map(|Json(value)| value),
        &now_iso(),
    );
    reply_response(reply)
}

async fn roster(State(hub): State<SharedHub>, headers: HeaderMap, request: Request) -> Response {
    let mut hub = hub.write().await;
    let reply = hub.handle("GET", &request.uri().to_string(), authorization(&headers), None, &now_iso());
    reply_response(reply)
}

fn authorization(headers: &HeaderMap) -> Option<&str> {
    headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok())
}

fn reply_response(reply: HttpReply) -> Response {
    let status = StatusCode::from_u16(reply.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    (status, Json(reply.body)).into_response()
}

async fn cors(request: Request, next: Next) -> Response {
    if request.method() == Method::OPTIONS {
        let mut response = StatusCode::NO_CONTENT.into_response();
        apply_cors(response.headers_mut());
        return response;
    }
    let mut response = next.run(request).await;
    apply_cors(response.headers_mut());
    response
}

fn apply_cors(headers: &mut HeaderMap) {
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("authorization, content-type"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, POST, OPTIONS"),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hub::Hub;
    use crate::share;
    use axum::body::Body;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[tokio::test]
    async fn health_reports_the_hub_version() {
        let app = router(share(Hub::new("0.3.0")));
        let response = app
            .oneshot(axum::http::Request::builder().uri("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["version"], "0.3.0");
        assert_eq!(body["ok"], true);
    }
}
