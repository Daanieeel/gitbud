use git2::Repository;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlameLine {
    pub line_no: usize,
    pub oid: String,
    pub author_name: String,
    pub summary: String,
    pub timestamp: i64,
}

pub fn blame_file(repo_path: &str, path: &str) -> Result<Vec<BlameLine>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let blame = repo
        .blame_file(std::path::Path::new(path), None)
        .map_err(|e| e.message().to_string())?;

    let mut lines = Vec::new();
    for hunk in blame.iter() {
        let oid = hunk.final_commit_id();
        let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
        let author_name = commit.author().name().unwrap_or("").to_string();
        let summary = commit.summary().unwrap_or("").to_string();
        let timestamp = commit.time().seconds();
        let oid_str = oid.to_string();

        let start = hunk.final_start_line();
        for offset in 0..hunk.lines_in_hunk() {
            lines.push(BlameLine {
                line_no: start + offset,
                oid: oid_str.clone(),
                author_name: author_name.clone(),
                summary: summary.clone(),
                timestamp,
            });
        }
    }
    lines.sort_by_key(|l| l.line_no);
    Ok(lines)
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
                "gitbud-test-blame-{name}-{}",
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
    fn blame_attributes_each_line_to_its_commit() {
        let scratch = ScratchRepo::new("basic");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("a.txt"), "line1\nline2\n").unwrap();
        repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        let first_oid = repo::commit(&repo_path, "add lines", "").unwrap();

        std::fs::write(scratch.path.join("a.txt"), "line1\nline2\nline3\n").unwrap();
        repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        let second_oid = repo::commit(&repo_path, "add line3", "").unwrap();

        let lines = blame_file(&repo_path, "a.txt").unwrap();
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0].oid, first_oid);
        assert_eq!(lines[1].oid, first_oid);
        assert_eq!(lines[2].oid, second_oid);
    }
}
