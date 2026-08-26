use git2::{ObjectType, Repository, ResetType};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReflogEntry {
    pub index: usize,
    pub oid: String,
    pub message: String,
}

/// The `HEAD` reflog — every place HEAD has pointed, most recent first. This is git's own
/// safety net for undoing resets, rebases, and accidental branch moves: as long as an entry
/// is still here, its commit hasn't been garbage-collected yet.
pub fn get_reflog(repo_path: &str) -> Result<Vec<ReflogEntry>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let reflog = repo.reflog("HEAD").map_err(|e| e.message().to_string())?;
    let mut entries = Vec::with_capacity(reflog.len());
    for (index, entry) in reflog.iter().enumerate() {
        entries.push(ReflogEntry {
            index,
            oid: entry.id_new().to_string(),
            message: entry.message().unwrap_or("").to_string(),
        });
    }
    Ok(entries)
}

/// Hard-resets HEAD (and the working tree) to a reflog entry's commit — "restore to here".
/// This is itself recorded as a new reflog entry, so it can be undone the same way.
pub fn restore_to(repo_path: &str, oid: &str) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let target = git2::Oid::from_str(oid).map_err(|e| e.message().to_string())?;
    let object = repo
        .find_object(target, Some(ObjectType::Commit))
        .map_err(|e| e.message().to_string())?;
    repo.reset(&object, ResetType::Hard, None)
        .map_err(|e| e.message().to_string())
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
                "gitbud-test-reflog-{name}-{}",
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
            Self { path }
        }

        fn path_str(&self) -> String {
            self.path.to_string_lossy().to_string()
        }

        fn write_and_commit(&self, file: &str, contents: &str, message: &str) -> String {
            std::fs::write(self.path.join(file), contents).unwrap();
            repo::stage_paths(&self.path_str(), &[file.to_string()]).unwrap();
            repo::commit(&self.path_str(), message, "").unwrap()
        }
    }

    impl Drop for ScratchRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn reflog_records_commits_and_restore_undoes_the_latest_one() {
        let scratch = ScratchRepo::new("restore");
        let repo_path = scratch.path_str();
        let first_oid = scratch.write_and_commit("a.txt", "one\n", "first");
        scratch.write_and_commit("a.txt", "two\n", "second");

        let entries = get_reflog(&repo_path).unwrap();
        assert!(entries.len() >= 2);
        assert_eq!(entries[0].message, "commit: second");

        restore_to(&repo_path, &first_oid).unwrap();

        let contents = std::fs::read_to_string(scratch.path.join("a.txt")).unwrap();
        assert_eq!(contents, "one\n");

        // The restore itself is recorded, so it can be undone the same way.
        let entries_after = get_reflog(&repo_path).unwrap();
        assert!(entries_after.len() > entries.len());
    }
}
