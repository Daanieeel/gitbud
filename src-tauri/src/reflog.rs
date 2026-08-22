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
    repo.reset(&object, ResetType::Hard, None).map_err(|e| e.message().to_string())
}
