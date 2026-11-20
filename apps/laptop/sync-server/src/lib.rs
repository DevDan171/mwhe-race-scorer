//! Local sync hub. Phones on the travel-router Wi-Fi push punches here.
//! There is no shared global key: each phone has its own pairing secret.

mod hub;
mod http;

pub use hub::{hub_now, lan_urls, Hub, PairingInput, PairingPayload, Snapshot, SYNC_PORT};
pub use http::{listen, router};

use std::sync::Arc;

use tokio::sync::RwLock;

pub type SharedHub = Arc<RwLock<Hub>>;

pub fn share(hub: Hub) -> SharedHub {
    Arc::new(RwLock::new(hub))
}
