use git2::{Config, Repository};
use std::process::Command;

/// Whether the `gpg` binary is available on PATH, for offering OpenPGP signing at all.
pub fn has_gpg() -> bool {
    Command::new("gpg").arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
}

/// Lists this machine's GPG secret keys as (key id, user id) pairs, for "import an existing key".
pub fn list_gpg_keys() -> Result<Vec<(String, String)>, String> {
    let output = Command::new("gpg")
        .args(["--list-secret-keys", "--with-colons"])
        .output()
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&output.stdout);

    let mut keys = Vec::new();
    let mut current_id: Option<String> = None;
    for line in text.lines() {
        let fields: Vec<&str> = line.split(':').collect();
        match fields.first() {
            Some(&"sec") => current_id = fields.get(4).map(|s| s.to_string()),
            Some(&"uid") => {
                if let (Some(id), Some(uid)) = (&current_id, fields.get(9)) {
                    keys.push((id.clone(), uid.to_string()));
                }
            }
            _ => {}
        }
    }
    Ok(keys)
}

/// Generates a new GPG signing key (no passphrase, since GitBud has no prompt UI for one) and
/// returns its key id.
pub fn generate_gpg_key(name: &str, email: &str) -> Result<String, String> {
    let batch = format!(
        "%no-protection\nKey-Type: EDDSA\nKey-Curve: ed25519\nSubkey-Type: ECDH\nSubkey-Curve: cv25519\nName-Real: {name}\nName-Email: {email}\nExpire-Date: 0\n%commit\n"
    );
    let batch_file = std::env::temp_dir().join(format!("gitbud-gpg-batch-{}.txt", std::process::id()));
    std::fs::write(&batch_file, &batch).map_err(|e| e.to_string())?;
    let output = Command::new("gpg")
        .args(["--batch", "--generate-key"])
        .arg(&batch_file)
        .output();
    let _ = std::fs::remove_file(&batch_file);
    let output = output.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    // gpg reports the new key's id on stderr, e.g. "gpg: key ABCDEF1234567890 marked as ultimately trusted"
    let stderr = String::from_utf8_lossy(&output.stderr);
    stderr
        .lines()
        .find_map(|l| l.trim().strip_prefix("gpg: key ").and_then(|rest| rest.split_whitespace().next()))
        .map(|s| s.to_string())
        .ok_or_else(|| "Generated the key but couldn't parse its id from gpg's output".to_string())
}

/// Generates a new SSH signing keypair at `path` (no passphrase) and returns the public key.
pub fn generate_ssh_signing_key(path: &str, email: &str) -> Result<String, String> {
    let output = Command::new("ssh-keygen")
        .args(["-t", "ed25519", "-f", path, "-N", "", "-C", email])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    std::fs::read_to_string(format!("{path}.pub")).map_err(|e| e.to_string())
}

fn open_config(repo_path: &str, global: bool) -> Result<Config, String> {
    if global {
        Config::open_default().map_err(|e| e.message().to_string())
    } else {
        Repository::open(repo_path)
            .map_err(|e| e.message().to_string())?
            .config()
            .map_err(|e| e.message().to_string())
    }
}

/// Wires commit signing into git config: `gpg.format`, `user.signingkey`, `commit.gpgsign`.
/// `format` is `"ssh"` or `"openpgp"`; `signing_key` is a pubkey file path (ssh) or key id (gpg).
pub fn configure_signing(repo_path: &str, format: &str, signing_key: &str, global: bool) -> Result<(), String> {
    let mut config = open_config(repo_path, global)?;
    config.set_str("gpg.format", format).map_err(|e| e.message().to_string())?;
    config.set_str("user.signingkey", signing_key).map_err(|e| e.message().to_string())?;
    config.set_bool("commit.gpgsign", true).map_err(|e| e.message().to_string())
}

pub fn disable_signing(repo_path: &str, global: bool) -> Result<(), String> {
    let mut config = open_config(repo_path, global)?;
    config.set_bool("commit.gpgsign", false).map_err(|e| e.message().to_string())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SigningStatus {
    pub enabled: bool,
    pub format: Option<String>,
    pub signing_key: Option<String>,
}

pub fn get_signing_status(repo_path: &str) -> Result<SigningStatus, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let config = repo.config().map_err(|e| e.message().to_string())?;
    Ok(SigningStatus {
        enabled: config.get_bool("commit.gpgsign").unwrap_or(false),
        format: config.get_string("gpg.format").ok(),
        signing_key: config.get_string("user.signingkey").ok(),
    })
}
