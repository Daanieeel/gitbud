use git2::Repository;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitEntry {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
}

pub fn get_log(repo_path: &str, limit: usize, skip: usize) -> Result<Vec<CommitEntry>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.message().to_string())?;
    revwalk.push_head().map_err(|e| e.message().to_string())?;
    revwalk
        .set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)
        .map_err(|e| e.message().to_string())?;

    let mut entries = Vec::with_capacity(limit);
    for oid in revwalk.skip(skip).take(limit) {
        let oid = oid.map_err(|e| e.message().to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
        let author = commit.author();
        entries.push(CommitEntry {
            oid: oid.to_string(),
            short_oid: oid.to_string().chars().take(7).collect(),
            summary: commit.summary().unwrap_or("").to_string(),
            author_name: author.name().unwrap_or("").to_string(),
            author_email: author.email().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
        });
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_log_of_real_repo() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let repo_root = std::path::Path::new(manifest_dir)
            .parent()
            .unwrap()
            .to_string_lossy()
            .to_string();

        let entries = get_log(&repo_root, 5, 0).expect("log should succeed");
        assert!(!entries.is_empty());
        assert!(entries[0].short_oid.len() == 7);
    }
}
