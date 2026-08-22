use git2::{Diff, DiffOptions, Repository};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LineKind {
    Context,
    Addition,
    Deletion,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub kind: LineKind,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub is_binary: bool,
    pub is_image: bool,
    pub hunks: Vec<DiffHunk>,
}

fn build_file_diff(path: &str, old_path: Option<&str>, diff: &Diff) -> Result<FileDiff, String> {
    let is_binary = RefCell::new(false);
    let hunks: RefCell<Vec<DiffHunk>> = RefCell::new(Vec::new());

    diff.foreach(
        &mut |delta, _progress| {
            if delta.flags().is_binary() {
                *is_binary.borrow_mut() = true;
            }
            true
        },
        None,
        Some(&mut |_delta, hunk| {
            hunks.borrow_mut().push(DiffHunk {
                header: String::from_utf8_lossy(hunk.header()).trim_end().to_string(),
                lines: Vec::new(),
            });
            true
        }),
        Some(&mut |_delta, _hunk, line| {
            let kind = match line.origin() {
                '+' => LineKind::Addition,
                '-' => LineKind::Deletion,
                _ => LineKind::Context,
            };
            let content = String::from_utf8_lossy(line.content())
                .trim_end_matches('\n')
                .to_string();
            let diff_line = DiffLine {
                kind,
                content,
                old_lineno: line.old_lineno(),
                new_lineno: line.new_lineno(),
            };
            if let Some(last) = hunks.borrow_mut().last_mut() {
                last.lines.push(diff_line);
            }
            true
        }),
    )
    .map_err(|e| e.message().to_string())?;

    Ok(FileDiff {
        is_image: crate::image_diff::is_image_path(path),
        path: path.to_string(),
        old_path: old_path.map(|s| s.to_string()),
        is_binary: is_binary.into_inner(),
        hunks: hunks.into_inner(),
    })
}

/// Diff a single file, either the staged side (HEAD -> index) or unstaged side (index -> workdir).
/// Applies the user's whitespace-handling preference to a set of diff options.
fn apply_whitespace_setting(opts: &mut DiffOptions) {
    if crate::settings::get_settings().map(|s| s.ignore_whitespace).unwrap_or(false) {
        opts.ignore_whitespace(true);
    }
}

pub fn get_file_diff(repo_path: &str, path: &str, staged: bool) -> Result<FileDiff, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut opts = DiffOptions::new();
    opts.pathspec(path).include_untracked(true).recurse_untracked_dirs(true);
    apply_whitespace_setting(&mut opts);

    let diff = if staged {
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
    } else {
        repo.diff_index_to_workdir(None, Some(&mut opts))
    }
    .map_err(|e| e.message().to_string())?;

    build_file_diff(path, None, &diff)
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
                "gitbud-test-{name}-{}",
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
    fn stage_commit_and_diff_roundtrip() {
        let scratch = ScratchRepo::new("diff-roundtrip");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("hello.txt"), "line one\n").unwrap();
        repo::stage_paths(&repo_path, &["hello.txt".to_string()]).unwrap();
        let oid = repo::commit(&repo_path, "initial commit", "").unwrap();

        // Unstaged modification produces an index->workdir diff.
        std::fs::write(scratch.path.join("hello.txt"), "line one\nline two\n").unwrap();
        let unstaged = get_file_diff(&repo_path, "hello.txt", false).unwrap();
        assert!(!unstaged.is_binary);
        assert!(unstaged.hunks.iter().any(|h| h.lines.iter().any(|l| l.kind == LineKind::Addition)));

        // Staging moves the same change into the HEAD->index diff.
        repo::stage_paths(&repo_path, &["hello.txt".to_string()]).unwrap();
        let staged = get_file_diff(&repo_path, "hello.txt", true).unwrap();
        assert!(staged.hunks.iter().any(|h| h.lines.iter().any(|l| l.kind == LineKind::Addition)));

        // The commit-diff path (used by History) sees the same content for the first commit.
        let files = get_commit_files(&repo_path, &oid).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].0, "hello.txt");
    }

    #[test]
    fn unstage_reverts_index_to_head() {
        let scratch = ScratchRepo::new("unstage");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("a.txt"), "a\n").unwrap();
        repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        repo::commit(&repo_path, "add a", "").unwrap();

        std::fs::write(scratch.path.join("a.txt"), "a\nb\n").unwrap();
        repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        let staged_before = repo::get_status(&repo_path).unwrap();
        assert!(staged_before.files.iter().any(|f| f.path == "a.txt" && f.staged));

        repo::unstage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        let staged_after = repo::get_status(&repo_path).unwrap();
        assert!(staged_after.files.iter().any(|f| f.path == "a.txt" && !f.staged));
    }
}

/// List the files changed by a commit relative to its first parent (or the empty tree, for a root commit).
pub fn get_commit_files(repo_path: &str, oid: &str) -> Result<Vec<(String, String)>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let commit = repo
        .find_commit(git2::Oid::from_str(oid).map_err(|e| e.message().to_string())?)
        .map_err(|e| e.message().to_string())?;
    let tree = commit.tree().map_err(|e| e.message().to_string())?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(|e| e.message().to_string())?;

    let mut files = Vec::new();
    for delta in diff.deltas() {
        let path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let status = format!("{:?}", delta.status());
        files.push((path, status));
    }
    Ok(files)
}

/// Diff a single file within a commit against its first parent (or empty tree for a root commit).
pub fn get_commit_file_diff(repo_path: &str, oid: &str, path: &str) -> Result<FileDiff, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let commit = repo
        .find_commit(git2::Oid::from_str(oid).map_err(|e| e.message().to_string())?)
        .map_err(|e| e.message().to_string())?;
    let tree = commit.tree().map_err(|e| e.message().to_string())?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

    let mut opts = DiffOptions::new();
    opts.pathspec(path);
    apply_whitespace_setting(&mut opts);

    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    build_file_diff(path, None, &diff)
}
