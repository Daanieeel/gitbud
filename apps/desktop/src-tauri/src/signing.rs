use git2::{Config, Repository};
use std::process::{Command, Output};

/// Extracts an error message from a failed command's output, falling back to stdout when
/// stderr is empty (some tools, like ssh-keygen's overwrite prompt, write there instead) and to
/// a generic message when both are empty (e.g. the process was killed, or declined a prompt with
/// no input attached and printed nothing at all).
fn output_error(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return stderr;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return stdout;
    }
    "command failed with no output".to_string()
}

/// Whether the `gpg` binary is available on PATH, for offering OpenPGP signing at all.
pub fn has_gpg() -> bool {
    Command::new("gpg")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Installs GnuPG via Homebrew (`brew install gnupg`) — macOS/Linux only, since that's the only
/// package manager GitBud offers a one-click install through. Blocks until brew finishes (which
/// can be well over a minute on a cold cache), so callers should run this off the UI thread and
/// show it as busy, then re-check `has_gpg` once it resolves rather than trusting this call
/// alone — a nonzero exit here doesn't necessarily mean gpg is still missing (e.g. "already
/// installed" isn't a hard failure worth surfacing).
pub fn install_gpg_via_brew() -> Result<(), String> {
    let output = Command::new("brew")
        .args(["install", "gnupg"])
        .output()
        .map_err(|e| format!("couldn't run brew: {e}"))?;
    if !output.status.success() {
        return Err(output_error(&output));
    }
    Ok(())
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
    let batch_file =
        std::env::temp_dir().join(format!("gitbud-gpg-batch-{}.txt", std::process::id()));
    std::fs::write(&batch_file, &batch).map_err(|e| e.to_string())?;
    let output = Command::new("gpg")
        .args(["--batch", "--generate-key"])
        .arg(&batch_file)
        .output();
    let _ = std::fs::remove_file(&batch_file);
    let output = output.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(output_error(&output));
    }
    // gpg reports the new key's id on stderr, e.g. "gpg: key ABCDEF1234567890 marked as ultimately trusted"
    let stderr = String::from_utf8_lossy(&output.stderr);
    stderr
        .lines()
        .find_map(|l| {
            l.trim()
                .strip_prefix("gpg: key ")
                .and_then(|rest| rest.split_whitespace().next())
        })
        .map(|s| s.to_string())
        .ok_or_else(|| "Generated the key but couldn't parse its id from gpg's output".to_string())
}

/// Generates a new SSH signing keypair at `path` (no passphrase) and returns the public key.
/// Idempotent: calling it again at the same path (e.g. the user hits "Generate" a second time)
/// just replaces the key rather than failing.
pub fn generate_ssh_signing_key(path: &str, email: &str) -> Result<String, String> {
    // ssh-keygen doesn't create missing parent directories itself (e.g. a fresh machine with
    // no ~/.ssh yet) — it just fails with "No such file or directory".
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Remove any previous key at this path before regenerating: otherwise ssh-keygen hits its
    // interactive "Overwrite (y/n)?" prompt, which writes to stdout and — with no terminal
    // attached — reads EOF, declines, and exits with an empty stderr, hiding the failure entirely.
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{path}.pub"));
    let output = Command::new("ssh-keygen")
        .args(["-t", "ed25519", "-f", path, "-N", "", "-C", email])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(output_error(&output));
    }
    std::fs::read_to_string(format!("{path}.pub")).map_err(|e| e.to_string())
}

/// Reads back the public key file the user just picked with a file dialog, so the wizard can
/// preview/copy it the same way it does for a freshly generated key.
pub fn read_ssh_public_key(pub_key_path: &str) -> Result<String, String> {
    std::fs::read_to_string(pub_key_path).map_err(|e| e.to_string())
}

/// Exports an OpenPGP key's public key in the armored form providers expect pasted into a
/// "New GPG key" field.
pub fn export_gpg_public_key(key_id: &str) -> Result<String, String> {
    let output = Command::new("gpg")
        .args(["--armor", "--export", key_id])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(output_error(&output));
    }
    let armored = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if armored.is_empty() {
        return Err(format!("No public key exported for {key_id}"));
    }
    Ok(armored)
}

/// Signs a throwaway payload and verifies it right back, proving the signing mechanism this
/// key/format actually works end to end — not just that git config points at it. `key` is a
/// private key file path for `"ssh"`, or a key id for anything else (OpenPGP).
pub fn test_signing(format: &str, key: &str) -> Result<(), String> {
    const PAYLOAD: &[u8] = b"gitbud commit signing test\n";
    const PRINCIPAL: &str = "gitbud-test";

    if format == "ssh" {
        let pubkey = std::fs::read_to_string(format!("{key}.pub"))
            .map_err(|e| format!("couldn't read {key}.pub: {e}"))?;
        let signature = crate::commit_service::ssh_sign(key, PAYLOAD)?;

        let dir = std::env::temp_dir();
        let suffix = std::process::id();
        let payload_path = dir.join(format!("gitbud-sign-test-{suffix}"));
        let sig_path = dir.join(format!("gitbud-sign-test-{suffix}.sig"));
        let allowed_signers_path = dir.join(format!("gitbud-sign-test-{suffix}.allowed_signers"));
        std::fs::write(&payload_path, PAYLOAD).map_err(|e| e.to_string())?;
        std::fs::write(&sig_path, &signature).map_err(|e| e.to_string())?;
        std::fs::write(
            &allowed_signers_path,
            format!("{PRINCIPAL} {}", pubkey.trim()),
        )
        .map_err(|e| e.to_string())?;

        let result = (|| {
            let file = std::fs::File::open(&payload_path).map_err(|e| e.to_string())?;
            let output = Command::new("ssh-keygen")
                .args([
                    "-Y",
                    "verify",
                    "-f",
                    allowed_signers_path.to_str().ok_or("bad temp path")?,
                    "-I",
                    PRINCIPAL,
                    "-n",
                    "git",
                    "-s",
                    sig_path.to_str().ok_or("bad temp path")?,
                ])
                .stdin(std::process::Stdio::from(file))
                .output()
                .map_err(|e| e.to_string())?;
            if !output.status.success() {
                return Err(output_error(&output));
            }
            Ok(())
        })();

        let _ = std::fs::remove_file(&payload_path);
        let _ = std::fs::remove_file(&sig_path);
        let _ = std::fs::remove_file(&allowed_signers_path);
        result
    } else {
        let signature = crate::commit_service::gpg_sign(key, PAYLOAD)?;

        let dir = std::env::temp_dir();
        let suffix = std::process::id();
        let payload_path = dir.join(format!("gitbud-sign-test-{suffix}"));
        let sig_path = dir.join(format!("gitbud-sign-test-{suffix}.asc"));
        std::fs::write(&payload_path, PAYLOAD).map_err(|e| e.to_string())?;
        std::fs::write(&sig_path, &signature).map_err(|e| e.to_string())?;

        let output = Command::new("gpg")
            .args(["--verify"])
            .arg(&sig_path)
            .arg(&payload_path)
            .output();

        let _ = std::fs::remove_file(&payload_path);
        let _ = std::fs::remove_file(&sig_path);

        let output = output.map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(output_error(&output));
        }
        Ok(())
    }
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
pub fn configure_signing(
    repo_path: &str,
    format: &str,
    signing_key: &str,
    global: bool,
) -> Result<(), String> {
    let mut config = open_config(repo_path, global)?;
    config
        .set_str("gpg.format", format)
        .map_err(|e| e.message().to_string())?;
    config
        .set_str("user.signingkey", signing_key)
        .map_err(|e| e.message().to_string())?;
    config
        .set_bool("commit.gpgsign", true)
        .map_err(|e| e.message().to_string())
}

pub fn disable_signing(repo_path: &str, global: bool) -> Result<(), String> {
    let mut config = open_config(repo_path, global)?;
    config
        .set_bool("commit.gpgsign", false)
        .map_err(|e| e.message().to_string())
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

// Only the repo-local (`global: false`) path is tested here. The `global: true` path opens
// `git2::Config::open_default()` — the real machine-wide `~/.gitconfig` — and there's no seam
// to redirect that in a unit test without risking mutating the developer's actual git config.
// `generate_gpg_key`/`list_gpg_keys` are skipped too: they depend on `gpg` being installed and
// (for generation) take real wall-clock time for entropy, which is exactly the flaky/slow
// combination not worth unit-testing.
#[cfg(test)]
mod tests {
    use super::*;

    struct ScratchRepo {
        path: std::path::PathBuf,
    }

    impl ScratchRepo {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "gitbud-test-signing-{name}-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(&path).unwrap();
            Repository::init(&path).unwrap();
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
    fn configure_and_disable_signing_roundtrip() {
        let scratch = ScratchRepo::new("roundtrip");
        let repo_path = scratch.path_str();

        let status = get_signing_status(&repo_path).unwrap();
        assert!(!status.enabled);

        configure_signing(&repo_path, "ssh", "/home/user/.ssh/signing.pub", false).unwrap();
        let status = get_signing_status(&repo_path).unwrap();
        assert!(status.enabled);
        assert_eq!(status.format.as_deref(), Some("ssh"));
        assert_eq!(
            status.signing_key.as_deref(),
            Some("/home/user/.ssh/signing.pub")
        );

        disable_signing(&repo_path, false).unwrap();
        let status = get_signing_status(&repo_path).unwrap();
        assert!(!status.enabled);
        // Disabling only flips commit.gpgsign back off — it deliberately leaves the key
        // configured so re-enabling doesn't require picking a key again.
        assert_eq!(
            status.signing_key.as_deref(),
            Some("/home/user/.ssh/signing.pub")
        );
    }

    #[test]
    fn generate_ssh_signing_key_writes_a_usable_keypair() {
        let dir =
            std::env::temp_dir().join(format!("gitbud-test-signing-sshkey-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let key_path = dir.join("id_ed25519").to_string_lossy().to_string();

        let pubkey = generate_ssh_signing_key(&key_path, "test@example.com").unwrap();

        assert!(pubkey.starts_with("ssh-ed25519 "));
        assert!(std::path::Path::new(&key_path).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Regression test: ssh-keygen's overwrite prompt for an already-existing key goes to
    /// stdout, and with no terminal attached it declines with an EMPTY stderr — which used to
    /// surface as a blank, invisible error in the UI whenever the user hit "Generate" a second
    /// time at the wizard's fixed default path. Regenerating at the same path must just work.
    #[test]
    fn generate_ssh_signing_key_is_idempotent() {
        let dir = std::env::temp_dir().join(format!(
            "gitbud-test-signing-sshkey-idempotent-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let key_path = dir.join("id_ed25519").to_string_lossy().to_string();

        let first = generate_ssh_signing_key(&key_path, "test@example.com").unwrap();
        let second = generate_ssh_signing_key(&key_path, "test@example.com").unwrap();

        assert!(first.starts_with("ssh-ed25519 "));
        assert!(second.starts_with("ssh-ed25519 "));
        assert_ne!(first, second, "regenerating should produce a fresh keypair");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Regression test: a fresh machine (or a first-time signing key, distinct from any
    /// existing auth key) may not have `~/.ssh` yet — ssh-keygen itself won't create it and
    /// used to fail outright.
    #[test]
    fn generate_ssh_signing_key_creates_missing_parent_dirs() {
        let dir = std::env::temp_dir().join(format!(
            "gitbud-test-signing-sshkey-missing-parent-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        assert!(!dir.exists());
        let key_path = dir
            .join("nested")
            .join("id_ed25519")
            .to_string_lossy()
            .to_string();

        let pubkey = generate_ssh_signing_key(&key_path, "test@example.com").unwrap();

        assert!(pubkey.starts_with("ssh-ed25519 "));
        assert!(std::path::Path::new(&key_path).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
