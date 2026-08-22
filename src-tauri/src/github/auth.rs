use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const KEYRING_SERVICE: &str = "com.gitbud.app";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    pub interval: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status")]
pub enum PollResult {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "success")]
    Success { account: Account },
    #[serde(rename = "denied")]
    Denied,
    #[serde(rename = "expired")]
    Expired,
}

fn config_dir() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or("could not resolve config directory")?;
    let dir = base.join("gitbud");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn accounts_file() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("github_accounts.json"))
}

fn client_id_file() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("github_client_id.txt"))
}

pub fn get_client_id() -> Result<Option<String>, String> {
    let file = client_id_file()?;
    if !file.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let trimmed = contents.trim().to_string();
    Ok(if trimmed.is_empty() { None } else { Some(trimmed) })
}

pub fn set_client_id(client_id: &str) -> Result<(), String> {
    fs::write(client_id_file()?, client_id.trim()).map_err(|e| e.to_string())
}

pub fn list_accounts() -> Result<Vec<Account>, String> {
    let file = accounts_file()?;
    if !file.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

fn save_accounts(accounts: &[Account]) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(accounts).map_err(|e| e.to_string())?;
    fs::write(accounts_file()?, contents).map_err(|e| e.to_string())
}

pub fn get_token(login: &str) -> Result<String, String> {
    keyring::Entry::new(KEYRING_SERVICE, login)
        .and_then(|entry| entry.get_password())
        .map_err(|e| format!("could not read stored token for {login}: {e}"))
}

pub fn remove_account(login: &str) -> Result<Vec<Account>, String> {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, login) {
        let _ = entry.delete_credential();
    }
    let mut accounts = list_accounts()?;
    accounts.retain(|a| a.login != login);
    save_accounts(&accounts)?;
    Ok(accounts)
}

fn save_account(account: Account, token: &str) -> Result<Vec<Account>, String> {
    keyring::Entry::new(KEYRING_SERVICE, &account.login)
        .and_then(|entry| entry.set_password(token))
        .map_err(|e| format!("could not store token in OS keychain: {e}"))?;

    let mut accounts = list_accounts()?;
    accounts.retain(|a| a.login != account.login);
    accounts.push(account);
    save_accounts(&accounts)?;
    Ok(accounts)
}

const USER_AGENT: &str = "GitBud";

/// Fetches the account for a token and persists it (keychain + accounts.json). Shared by
/// both the device-flow success path and `gh` CLI token detection.
async fn complete_login(token: &str) -> Result<Account, String> {
    let client = reqwest::Client::new();
    let user = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<GitHubUserResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let account = Account {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
    };
    save_account(account.clone(), token)?;
    Ok(account)
}

/// Looks for an existing `gh` CLI login (`gh auth token`) and, if found, adopts it as a
/// GitBud account — zero-config sign-in for developers who already use the GitHub CLI.
pub async fn detect_gh_cli() -> Result<Option<Account>, String> {
    let output = std::process::Command::new("gh")
        .args(["auth", "token"])
        .output();

    let Ok(output) = output else { return Ok(None) };
    if !output.status.success() {
        return Ok(None);
    }
    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        return Ok(None);
    }
    complete_login(&token).await.map(Some)
}

pub async fn start_device_flow(client_id: &str) -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("User-Agent", USER_AGENT)
        .form(&[("client_id", client_id), ("scope", "repo")])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("GitHub device code request failed: {}", res.status()));
    }
    res.json::<DeviceCodeResponse>().await.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
struct AccessTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubUserResponse {
    login: String,
    name: Option<String>,
    avatar_url: String,
}

/// Polls the token endpoint once. The caller (frontend) is responsible for waiting
/// `interval` seconds between calls and giving up after `expires_in`, so this never
/// blocks for long — it's a single request/response round trip.
pub async fn poll_device_flow(client_id: &str, device_code: &str) -> Result<PollResult, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("User-Agent", USER_AGENT)
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<AccessTokenResponse>()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(token) = res.access_token {
        let account = complete_login(&token).await?;
        return Ok(PollResult::Success { account });
    }

    match res.error.as_deref() {
        Some("authorization_pending") | Some("slow_down") => Ok(PollResult::Pending),
        Some("expired_token") => Ok(PollResult::Expired),
        Some("access_denied") => Ok(PollResult::Denied),
        Some(other) => Err(format!("GitHub auth error: {other}")),
        None => Err("GitHub auth: no token and no error in response".to_string()),
    }
}
