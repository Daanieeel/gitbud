use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// A plain SSH-key-based git identity: no hosted-provider API, just a host + key pair used
/// to authenticate git operations over SSH. Complements GitHub accounts in the account
/// switcher for people who push over SSH to GitHub, GitLab, Bitbucket, or a bare host.
///
/// `name`/`email` are the commit-attributable identity to apply alongside the SSH key when
/// this identity becomes active — empty (the default for identities saved before these fields
/// existed) means "don't touch `user.name`/`user.email`", since writing blanks would silently
/// break commit authorship rather than just leaving whatever was there before.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshIdentity {
    pub id: String,
    pub label: String,
    pub host: String,
    pub key_path: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub email: String,
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

pub fn add(
    label: &str,
    host: &str,
    key_path: &str,
    name: &str,
    email: &str,
) -> Result<Vec<SshIdentity>, String> {
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
    let label = if label.trim().is_empty() {
        host.clone()
    } else {
        label.trim().to_string()
    };
    identities.push(SshIdentity {
        id,
        label,
        host,
        key_path,
        name: name.trim().to_string(),
        email: email.trim().to_string(),
    });
    save(&identities)?;
    Ok(identities)
}

pub fn remove(id: &str) -> Result<Vec<SshIdentity>, String> {
    let mut identities = list()?;
    identities.retain(|i| i.id != id);
    save(&identities)?;
    Ok(identities)
}

#[allow(clippy::too_many_arguments)]
pub fn update(
    id: &str,
    label: &str,
    host: &str,
    key_path: &str,
    name: &str,
    email: &str,
) -> Result<Vec<SshIdentity>, String> {
    let host = host.trim().to_string();
    let key_path = key_path.trim().to_string();
    if host.is_empty() {
        return Err("Host is required".to_string());
    }
    if key_path.is_empty() {
        return Err("SSH key path is required".to_string());
    }

    let mut identities = list()?;
    let entry = identities
        .iter_mut()
        .find(|i| i.id == id)
        .ok_or_else(|| "SSH identity not found".to_string())?;
    entry.label = if label.trim().is_empty() {
        host.clone()
    } else {
        label.trim().to_string()
    };
    entry.host = host;
    entry.key_path = key_path;
    entry.name = name.trim().to_string();
    entry.email = email.trim().to_string();
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
    config
        .set_str("core.sshCommand", &command)
        .map_err(|e| e.message().to_string())
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

// Only `apply_to_repo`/`clear_from_repo` are covered here — `list`/`add`/`remove` read and
// write `~/.config/gitbud/ssh_identities.json` with no test seam, and exercising them would
// mean mutating the real user's config directory from `cargo test`.
#[cfg(test)]
mod tests {
    use super::*;

    struct ScratchRepo {
        path: std::path::PathBuf,
    }

    impl ScratchRepo {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "gitbud-test-ssh-identity-{name}-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(&path).unwrap();
            git2::Repository::init(&path).unwrap();
            Self { path }
        }

        fn path_str(&self) -> String {
            self.path.to_string_lossy().to_string()
        }
    }

    impl Drop for ScratchRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn apply_and_clear_roundtrip() {
        let scratch = ScratchRepo::new("roundtrip");
        let repo_path = scratch.path_str();

        apply_to_repo(&repo_path, "/home/user/.ssh/id_ed25519").unwrap();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let config = repo.config().unwrap();
        assert_eq!(
            config.get_string("core.sshCommand").unwrap(),
            "ssh -i '/home/user/.ssh/id_ed25519' -o IdentitiesOnly=yes"
        );

        clear_from_repo(&repo_path).unwrap();
        let repo = git2::Repository::open(&repo_path).unwrap();
        assert!(repo
            .config()
            .unwrap()
            .get_string("core.sshCommand")
            .is_err());
    }

    #[test]
    fn apply_escapes_single_quotes_in_key_path() {
        let scratch = ScratchRepo::new("escaping");
        let repo_path = scratch.path_str();

        apply_to_repo(&repo_path, "/tmp/it's a key").unwrap();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let command = repo
            .config()
            .unwrap()
            .get_string("core.sshCommand")
            .unwrap();
        assert_eq!(
            command,
            "ssh -i '/tmp/it'\\''s a key' -o IdentitiesOnly=yes"
        );
    }

    #[test]
    fn clear_is_a_noop_when_nothing_was_applied() {
        let scratch = ScratchRepo::new("noop-clear");
        clear_from_repo(&scratch.path_str()).unwrap();
    }
}
