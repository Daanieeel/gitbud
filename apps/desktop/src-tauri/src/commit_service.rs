use git2::{Commit, Oid, Repository, Signature, Tree};
use std::io::Write;
use std::process::Stdio;

/// Resolves what ref a "HEAD-relative" commit should update — HEAD's *symbolic* target
/// (e.g. "refs/heads/main"), not HEAD itself, so a direct write here never detaches it.
/// Works even for an unborn HEAD (a fresh repo before its first commit), where `repo.head()`
/// fails because there's nothing to peel yet but the symbolic target still resolves.
pub fn resolve_head_ref_name(repo: &Repository) -> Result<String, String> {
    let head = repo
        .find_reference("HEAD")
        .map_err(|e| e.message().to_string())?;
    let target = head
        .symbolic_target()
        .ok_or("HEAD is not a symbolic reference")?;
    Ok(target.to_string())
}

fn signing_config(repo: &Repository) -> Result<Option<(String, String)>, String> {
    let config = repo.config().map_err(|e| e.message().to_string())?;
    if !config.get_bool("commit.gpgsign").unwrap_or(false) {
        return Ok(None);
    }
    let format = config
        .get_string("gpg.format")
        .unwrap_or_else(|_| "openpgp".to_string());
    let key = config
        .get_string("user.signingkey")
        .map_err(|_| "commit.gpgsign is on but user.signingkey isn't set".to_string())?;
    Ok(Some((format, key)))
}

/// Detached-signs `buffer` (a commit object's serialized content) with an SSH key, returning
/// the armored `SSH SIGNATURE` block git embeds verbatim in the commit's `gpgsig` header.
/// `key_path` must be an unencrypted private key file (GitBud never generates passphrase-
/// protected keys, since there's no prompt UI to ask for one) — ssh-keygen reads it directly,
/// no agent involved.
pub fn ssh_sign(key_path: &str, buffer: &[u8]) -> Result<String, String> {
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let id = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let dir = std::env::temp_dir();
    let buf_path = dir.join(format!("gitbud-commit-buf-{}-{}", std::process::id(), id));
    std::fs::write(&buf_path, buffer).map_err(|e| e.to_string())?;
    let sig_path = dir.join(format!(
        "gitbud-commit-buf-{}-{}.sig",
        std::process::id(),
        id
    ));
    let _ = std::fs::remove_file(&sig_path);

    let output = crate::signing::command_with_path("ssh-keygen")
        .args(["-Y", "sign", "-n", "git", "-f", key_path])
        .arg(&buf_path)
        .output();
    let result = (|| {
        let output = output.map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        std::fs::read_to_string(&sig_path).map_err(|e| e.to_string())
    })();

    let _ = std::fs::remove_file(&buf_path);
    let _ = std::fs::remove_file(&sig_path);
    result
}

/// Detached-signs `buffer` with a GPG key, returning the armored `PGP SIGNATURE` block.
pub fn gpg_sign(key_id: &str, buffer: &[u8]) -> Result<String, String> {
    let mut child = crate::signing::command_with_path("gpg")
        .args([
            "--batch",
            "--yes",
            "--detach-sign",
            "--armor",
            "--local-user",
            key_id,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    child
        .stdin
        .take()
        .ok_or("no stdin")?
        .write_all(buffer)
        .map_err(|e| e.to_string())?;
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}

/// Signs `buffer` per the repo's configured format, or returns `None` if signing is off.
fn sign_if_configured(repo: &Repository, buffer: &[u8]) -> Result<Option<String>, String> {
    let Some((format, key)) = signing_config(repo)? else {
        return Ok(None);
    };
    let signature = match format.as_str() {
        "ssh" => ssh_sign(&key, buffer)?,
        _ => gpg_sign(&key, buffer)?,
    };
    Ok(Some(signature))
}

/// The one place in this crate allowed to create a commit object. `create_commit` and
/// `amend_commit_object` below (this module's only public entry points) both route through it,
/// so commit signing (`commit.gpgsign`/`gpg.format`/`user.signingkey`) is applied uniformly
/// instead of every call site needing to remember to check it itself. Staying private makes
/// bypassing signing a compile error, not just a convention.
fn commit_object(
    repo: &Repository,
    author: &Signature,
    committer: &Signature,
    message: &str,
    tree: &Tree,
    parents: &[&Commit],
) -> Result<Oid, String> {
    let buffer = repo
        .commit_create_buffer(author, committer, message, tree, parents)
        .map_err(|e| e.message().to_string())?;

    match sign_if_configured(repo, &buffer)? {
        Some(signature) => {
            let content = std::str::from_utf8(&buffer).map_err(|e| e.to_string())?;
            repo.commit_signed(content, &signature, None)
                .map_err(|e| e.message().to_string())
        }
        None => repo
            .commit(None, author, committer, message, tree, parents)
            .map_err(|e| e.message().to_string()),
    }
}

/// First line of a commit message — what git's own reflog entries show, regardless of how
/// long the full message is.
fn summary_line(message: &str) -> &str {
    message.split('\n').next().unwrap_or("")
}

fn update_ref(repo: &Repository, refname: &str, oid: Oid, log_message: &str) -> Result<(), String> {
    repo.reference(refname, oid, true, log_message)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

pub fn create_commit(
    repo: &Repository,
    update_ref_name: Option<&str>,
    author: &Signature,
    committer: &Signature,
    message: &str,
    tree: &Tree,
    parents: &[&Commit],
) -> Result<Oid, String> {
    let oid = commit_object(repo, author, committer, message, tree, parents)?;
    if let Some(refname) = update_ref_name {
        // Mirrors git_commit_create's own reflog message convention, since we bypass its
        // built-in ref update to add signing in between.
        let kind = match parents.len() {
            0 => "commit (initial)",
            1 => "commit",
            _ => "commit (merge)",
        };
        update_ref(
            repo,
            refname,
            oid,
            &format!("{kind}: {}", summary_line(message)),
        )?;
    }
    Ok(oid)
}

/// Recreates `target` with a new message/tree but the same parents, author, and committer —
/// the same "keep everything but message/tree" semantics `git2::Commit::amend` has, routed
/// through the same signing-aware commit creation. Squash/fixup during an interactive rebase
/// is really just an amend of the commit-so-far, so this covers both.
pub fn amend_commit_object(
    repo: &Repository,
    target: &Commit,
    update_ref_name: Option<&str>,
    message: &str,
    tree: &Tree,
) -> Result<Oid, String> {
    let parents: Vec<Commit> = target.parents().collect();
    let parent_refs: Vec<&Commit> = parents.iter().collect();
    let oid = commit_object(
        repo,
        &target.author(),
        &target.committer(),
        message,
        tree,
        &parent_refs,
    )?;
    if let Some(refname) = update_ref_name {
        update_ref(
            repo,
            refname,
            oid,
            &format!("commit (amend): {}", summary_line(message)),
        )?;
    }
    Ok(oid)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct ScratchRepo {
        path: std::path::PathBuf,
    }

    impl ScratchRepo {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "gitbud-test-commit-service-{name}-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(&path).unwrap();
            let repo = Repository::init(&path).unwrap();
            let mut config = repo.config().unwrap();
            config.set_str("user.name", "Test").unwrap();
            config.set_str("user.email", "test@example.com").unwrap();
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
    fn unsigned_commit_updates_head_and_creates_the_branch() {
        let scratch = ScratchRepo::new("unsigned-root");
        let repo = Repository::open(scratch.path_str()).unwrap();
        let sig = repo.signature().unwrap();
        let tree_id = repo.treebuilder(None).unwrap().write().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();

        let head_ref = resolve_head_ref_name(&repo).unwrap();
        let oid = create_commit(&repo, Some(&head_ref), &sig, &sig, "root", &tree, &[]).unwrap();

        let head_commit = repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head_commit.id(), oid);
        assert_eq!(head_commit.message(), Some("root"));
    }

    #[test]
    fn amend_keeps_parents_and_identity_but_changes_message() {
        let scratch = ScratchRepo::new("amend");
        let repo = Repository::open(scratch.path_str()).unwrap();
        let sig = Signature::now("Original Author", "original@example.com").unwrap();
        let tree_id = repo.treebuilder(None).unwrap().write().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let head_ref = resolve_head_ref_name(&repo).unwrap();
        let first_oid =
            create_commit(&repo, Some(&head_ref), &sig, &sig, "first", &tree, &[]).unwrap();
        let first = repo.find_commit(first_oid).unwrap();

        let amended_oid =
            amend_commit_object(&repo, &first, Some(&head_ref), "amended", &tree).unwrap();
        let amended = repo.find_commit(amended_oid).unwrap();

        assert_eq!(amended.message(), Some("amended"));
        assert_eq!(amended.author().name(), Some("Original Author"));
        assert_eq!(amended.parent_count(), 0);
        let head_commit = repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head_commit.id(), amended_oid);
    }

    /// This is the actual bug this module fixes: `commit.gpgsign` being on used to be silently
    /// ignored (see the git2 `.commit()` calls this file replaced). Proves a commit made while
    /// signing is configured really does carry a verifiable signature, not just that the config
    /// says it should.
    #[test]
    fn commit_with_ssh_signing_enabled_is_actually_signed() {
        let scratch = ScratchRepo::new("ssh-signed");
        let repo = Repository::open(scratch.path_str()).unwrap();

        let key_dir = std::env::temp_dir().join(format!(
            "gitbud-test-commit-service-sshkey-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&key_dir).unwrap();
        let key_path = key_dir.join("id_ed25519").to_string_lossy().to_string();
        let pubkey =
            crate::signing::generate_ssh_signing_key(&key_path, "test@example.com").unwrap();

        crate::signing::configure_signing(&scratch.path_str(), "ssh", &key_path, false).unwrap();

        let sig = repo.signature().unwrap();
        let tree_id = repo.treebuilder(None).unwrap().write().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let head_ref = resolve_head_ref_name(&repo).unwrap();
        let oid = create_commit(&repo, Some(&head_ref), &sig, &sig, "signed", &tree, &[]).unwrap();

        let (signature_buf, content_buf) = repo.extract_signature(&oid, None).unwrap();
        let signature = signature_buf.as_str().unwrap();
        assert!(signature.starts_with("-----BEGIN SSH SIGNATURE-----"));

        let allowed_signers = key_dir.join("allowed_signers");
        std::fs::write(
            &allowed_signers,
            format!("test@example.com {}", pubkey.trim()),
        )
        .unwrap();
        let sig_file = key_dir.join("commit.sig");
        std::fs::write(&sig_file, signature).unwrap();
        let content_file = key_dir.join("commit.content");
        std::fs::write(&content_file, &*content_buf).unwrap();

        let verify = std::process::Command::new("ssh-keygen")
            .args([
                "-Y",
                "verify",
                "-f",
                allowed_signers.to_str().unwrap(),
                "-I",
                "test@example.com",
                "-n",
                "git",
                "-s",
                sig_file.to_str().unwrap(),
            ])
            .stdin(std::process::Stdio::from(
                std::fs::File::open(&content_file).unwrap(),
            ))
            .output()
            .unwrap();
        assert!(
            verify.status.success(),
            "ssh-keygen verify failed: {}",
            String::from_utf8_lossy(&verify.stderr)
        );

        let _ = std::fs::remove_dir_all(&key_dir);
    }
}
