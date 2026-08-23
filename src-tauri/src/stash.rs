use git2::{Repository, StashFlags};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StashEntry {
    pub index: usize,
    pub message: String,
}

pub fn list_stashes(repo_path: &str) -> Result<Vec<StashEntry>, String> {
    let mut repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut entries = Vec::new();
    repo.stash_foreach(|index, message, _oid| {
        entries.push(StashEntry {
            index,
            message: message.to_string(),
        });
        true
    })
    .map_err(|e| e.message().to_string())?;
    Ok(entries)
}

pub fn stash_save(repo_path: &str, message: &str, include_untracked: bool) -> Result<(), String> {
    let mut repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let signature = repo.signature().map_err(|e| e.message().to_string())?;
    let mut flags = StashFlags::DEFAULT;
    if include_untracked {
        flags |= StashFlags::INCLUDE_UNTRACKED;
    }
    let msg = if message.trim().is_empty() {
        None
    } else {
        Some(message)
    };
    repo.stash_save2(&signature, msg, Some(flags))
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

pub fn stash_apply(repo_path: &str, index: usize) -> Result<(), String> {
    let mut repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    repo.stash_apply(index, None).map_err(|e| e.message().to_string())
}

pub fn stash_pop(repo_path: &str, index: usize) -> Result<(), String> {
    let mut repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    repo.stash_pop(index, None).map_err(|e| e.message().to_string())
}

pub fn stash_drop(repo_path: &str, index: usize) -> Result<(), String> {
    let mut repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    repo.stash_drop(index).map_err(|e| e.message().to_string())
}

/// A stash entry is itself a commit — this resolves its oid so the frontend can reuse the
/// existing commit-diff endpoints (`get_commit_files`/`get_commit_file_diff`) for a stash's
/// file list and per-file diff preview instead of duplicating that logic.
pub fn stash_oid(repo_path: &str, index: usize) -> Result<String, String> {
    let mut repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut found = None;
    repo.stash_foreach(|i, _message, oid| {
        if i == index {
            found = Some(oid.to_string());
        }
        true
    })
    .map_err(|e| e.message().to_string())?;
    found.ok_or_else(|| format!("No stash at index {index}"))
}

/// Restores a single file out of a stash (into both the index and working tree) without
/// touching the rest of the working tree or removing the stash — a partial apply.
pub fn stash_apply_file(repo_path: &str, index: usize, path: &str) -> Result<(), String> {
    let output = std::process::Command::new(crate::settings::git_binary())
        .args(["checkout", &format!("stash@{{{index}}}"), "--", path])
        .current_dir(repo_path)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo;

    struct ScratchRepo {
        path: std::path::PathBuf,
    }

    impl ScratchRepo {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "gitbud-test-stash-{name}-{}",
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
            config.set_bool("core.autocrlf", false).unwrap();
            std::fs::write(path.join("a.txt"), "a\n").unwrap();
            repo::stage_paths(&path.to_string_lossy(), &["a.txt".to_string()]).unwrap();
            repo::commit(&path.to_string_lossy(), "init", "").unwrap();
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
    fn stash_save_list_pop_roundtrip() {
        let scratch = ScratchRepo::new("roundtrip");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("a.txt"), "a\nb\n").unwrap();
        stash_save(&repo_path, "wip", false).unwrap();

        // Working tree is clean again after stashing.
        let status = repo::get_status(&repo_path).unwrap();
        assert!(status.files.is_empty());

        let stashes = list_stashes(&repo_path).unwrap();
        assert_eq!(stashes.len(), 1);

        stash_pop(&repo_path, 0).unwrap();
        let status = repo::get_status(&repo_path).unwrap();
        assert!(status.files.iter().any(|f| f.path == "a.txt"));

        let stashes = list_stashes(&repo_path).unwrap();
        assert!(stashes.is_empty());
    }
}
