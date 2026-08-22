use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// A plain SSH-key-based git identity: no hosted-provider API, just a host + key pair used
/// to authenticate git operations over SSH. Complements GitHub accounts in the account
/// switcher for people who push over SSH to GitHub, GitLab, Bitbucket, or a bare host.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshIdentity {
    pub id: String,
    pub label: String,
    pub host: String,
    pub key_path: String,
}

fn config_dir() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or("could not resolve config directory")?;
    let dir = base.join("gitbud");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn identities_file() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("ssh_identities.json"))
}

pub fn list() -> Result<Vec<SshIdentity>, String> {
    let file = identities_file()?;
    if !file.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

fn save(identities: &[SshIdentity]) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(identities).map_err(|e| e.to_string())?;
    fs::write(identities_file()?, contents).map_err(|e| e.to_string())
}

pub fn add(label: &str, host: &str, key_path: &str) -> Result<Vec<SshIdentity>, String> {
    let host = host.trim().to_string();
    let key_path = key_path.trim().to_string();
    if host.is_empty() {
        return Err("Host is required".to_string());
    }
    if key_path.is_empty() {
        return Err("SSH key path is required".to_string());
    }

    let mut identities = list()?;
    let id = format!("{host}-{}", chrono::Utc::now().timestamp_millis());
    let label = if label.trim().is_empty() { host.clone() } else { label.trim().to_string() };
    identities.push(SshIdentity { id, label, host, key_path });
    save(&identities)?;
    Ok(identities)
}

pub fn remove(id: &str) -> Result<Vec<SshIdentity>, String> {
    let mut identities = list()?;
    identities.retain(|i| i.id != id);
    save(&identities)?;
    Ok(identities)
}

/// Wires an SSH key into a specific repo by setting the repo-local `core.sshCommand`, so
/// push/fetch/pull for that repo authenticate with this key regardless of the user's
/// default SSH agent/config.
pub fn apply_to_repo(repo_path: &str, key_path: &str) -> Result<(), String> {
    let repo = git2::Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut config = repo.config().map_err(|e| e.message().to_string())?;
    let escaped = key_path.replace('\'', "'\\''");
    let command = format!("ssh -i '{escaped}' -o IdentitiesOnly=yes");
    config.set_str("core.sshCommand", &command).map_err(|e| e.message().to_string())
}

/// Removes any repo-local `core.sshCommand` override, restoring the user's default SSH setup.
pub fn clear_from_repo(repo_path: &str) -> Result<(), String> {
    let repo = git2::Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut config = repo.config().map_err(|e| e.message().to_string())?;
    match config.remove("core.sshCommand") {
        Ok(()) => Ok(()),
        Err(e) if e.code() == git2::ErrorCode::NotFound => Ok(()),
        Err(e) => Err(e.message().to_string()),
    }
}
