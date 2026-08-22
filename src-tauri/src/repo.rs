use git2::{Repository, StatusOptions};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    TypeChange,
    Conflicted,
    Untracked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub old_path: Option<String>,
    pub status: ChangeKind,
    pub staged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoStatus {
    pub files: Vec<FileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
}

fn kind_from_flags(flags: git2::Status, index_side: bool) -> Option<ChangeKind> {
    if flags.is_conflicted() {
        return Some(ChangeKind::Conflicted);
    }
    if index_side {
        if flags.is_index_new() {
            return Some(ChangeKind::Added);
        }
        if flags.is_index_modified() {
            return Some(ChangeKind::Modified);
        }
        if flags.is_index_deleted() {
            return Some(ChangeKind::Deleted);
        }
        if flags.is_index_renamed() {
            return Some(ChangeKind::Renamed);
        }
        if flags.is_index_typechange() {
            return Some(ChangeKind::TypeChange);
        }
    } else {
        if flags.is_wt_new() {
            return Some(ChangeKind::Untracked);
        }
        if flags.is_wt_modified() {
            return Some(ChangeKind::Modified);
        }
        if flags.is_wt_deleted() {
            return Some(ChangeKind::Deleted);
        }
        if flags.is_wt_renamed() {
            return Some(ChangeKind::Renamed);
        }
        if flags.is_wt_typechange() {
            return Some(ChangeKind::TypeChange);
        }
    }
    None
}

pub fn get_status(repo_path: &str) -> Result<RepoStatus, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    let mut files = Vec::with_capacity(statuses.len());
    for entry in statuses.iter() {
        let flags = entry.status();
        if flags.is_ignored() {
            continue;
        }

        let index_kind = kind_from_flags(flags, true);
        let worktree_kind = kind_from_flags(flags, false);
        let staged = index_kind.is_some();
        let status = worktree_kind.or(index_kind).unwrap_or(ChangeKind::Modified);

        let (path, old_path) = if let Some(diff) = entry.index_to_workdir().or(entry.head_to_index()) {
            let new_path = diff
                .new_file()
                .path()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let old_path = diff.old_file().path().map(|p| p.to_string_lossy().to_string());
            let old_path = match &old_path {
                Some(op) if op != &new_path => old_path,
                _ => None,
            };
            (new_path, old_path)
        } else {
            (entry.path().unwrap_or_default().to_string(), None)
        };

        files.push(FileEntry {
            path,
            old_path,
            status,
            staged,
        });
    }

    Ok(RepoStatus { files })
}

pub fn is_dirty(repo_path: &str) -> Result<bool, String> {
    get_status(repo_path).map(|s| !s.files.is_empty())
}

pub fn get_current_branch(repo_path: &str) -> Result<String, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let head = repo.head().map_err(|e| e.message().to_string())?;
    if head.is_branch() {
        Ok(head.shorthand().unwrap_or("HEAD").to_string())
    } else {
        Ok("HEAD (detached)".to_string())
    }
}

pub fn list_branches(repo_path: &str) -> Result<Vec<BranchInfo>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let head_name = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let mut result = Vec::new();
    let branches = repo
        .branches(None)
        .map_err(|e| e.message().to_string())?;
    for branch in branches {
        let (branch, branch_type) = branch.map_err(|e| e.message().to_string())?;
        let name = match branch.name().map_err(|e| e.message().to_string())? {
            Some(n) => n.to_string(),
            None => continue,
        };
        let is_remote = branch_type == git2::BranchType::Remote;
        let is_head = !is_remote && head_name.as_deref() == Some(name.as_str());
        result.push(BranchInfo {
            name,
            is_head,
            is_remote,
        });
    }
    Ok(result)
}

pub fn checkout_branch(repo_path: &str, branch: &str) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let (object, reference) = repo
        .revparse_ext(branch)
        .map_err(|e| e.message().to_string())?;
    repo.checkout_tree(&object, None)
        .map_err(|e| e.message().to_string())?;
    match reference {
        Some(r) => repo.set_head(r.name().ok_or("invalid ref name")?),
        None => repo.set_head_detached(object.id()),
    }
    .map_err(|e| e.message().to_string())
}

pub fn create_branch(repo_path: &str, name: &str, checkout: bool) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let head_commit = repo
        .head()
        .and_then(|h| h.peel_to_commit())
        .map_err(|e| e.message().to_string())?;
    repo.branch(name, &head_commit, false)
        .map_err(|e| e.message().to_string())?;
    if checkout {
        checkout_branch(repo_path, name)?;
    }
    Ok(())
}

pub fn create_branch_at(
    repo_path: &str,
    name: &str,
    oid: &str,
    checkout: bool,
) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let commit = repo
        .find_commit(git2::Oid::from_str(oid).map_err(|e| e.message().to_string())?)
        .map_err(|e| e.message().to_string())?;
    repo.branch(name, &commit, false)
        .map_err(|e| e.message().to_string())?;
    if checkout {
        checkout_branch(repo_path, name)?;
    }
    Ok(())
}

pub fn stage_paths(repo_path: &str, paths: &[String]) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    for path in paths {
        let full = std::path::Path::new(repo_path).join(path);
        if full.exists() {
            index.add_path(std::path::Path::new(path)).map_err(|e| e.message().to_string())?;
        } else {
            index.remove_path(std::path::Path::new(path)).map_err(|e| e.message().to_string())?;
        }
    }
    index.write().map_err(|e| e.message().to_string())
}

pub fn unstage_paths(repo_path: &str, paths: &[String]) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let head = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    match head {
        Some(commit) => {
            let obj = commit.as_object();
            for path in paths {
                repo.reset_default(Some(obj), [std::path::Path::new(path)])
                    .map_err(|e| e.message().to_string())?;
            }
            Ok(())
        }
        None => {
            // No HEAD yet (empty repo) — unstaging means removing from index entirely.
            let mut index = repo.index().map_err(|e| e.message().to_string())?;
            for path in paths {
                index
                    .remove_path(std::path::Path::new(path))
                    .map_err(|e| e.message().to_string())?;
            }
            index.write().map_err(|e| e.message().to_string())
        }
    }
}

/// Discards all uncommitted changes (staged and unstaged) to a single file: untracked
/// files are deleted, tracked files are reset to their HEAD content in both the index
/// and the working tree.
pub fn discard_file(repo_path: &str, path: &str) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let full_path = std::path::Path::new(repo_path).join(path);

    let status = repo
        .status_file(std::path::Path::new(path))
        .map_err(|e| e.message().to_string())?;

    if status.is_wt_new() {
        if full_path.exists() {
            std::fs::remove_file(&full_path).map_err(|e| e.to_string())?;
        }
        let mut index = repo.index().map_err(|e| e.message().to_string())?;
        index.remove_path(std::path::Path::new(path)).ok();
        return index.write().map_err(|e| e.message().to_string());
    }

    let head_commit = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    match head_commit {
        Some(head_commit) => {
            let head_obj = head_commit.as_object();
            repo.reset_default(Some(head_obj), [std::path::Path::new(path)])
                .map_err(|e| e.message().to_string())?;
            let mut checkout = git2::build::CheckoutBuilder::new();
            checkout.path(path).force();
            repo.checkout_tree(head_obj, Some(&mut checkout))
                .map_err(|e| e.message().to_string())
        }
        None => {
            // No HEAD yet — nothing to restore to; discarding a tracked-in-index-only
            // file just means dropping it entirely.
            if full_path.exists() {
                std::fs::remove_file(&full_path).map_err(|e| e.to_string())?;
            }
            let mut index = repo.index().map_err(|e| e.message().to_string())?;
            index.remove_path(std::path::Path::new(path)).ok();
            index.write().map_err(|e| e.message().to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn this_repo() -> String {
        // src-tauri/src/repo.rs -> repo root is two levels up from CARGO_MANIFEST_DIR (src-tauri)
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        std::path::Path::new(manifest_dir)
            .parent()
            .unwrap()
            .to_string_lossy()
            .to_string()
    }

    #[test]
    fn reads_status_of_real_repo() {
        let status = get_status(&this_repo()).expect("status should succeed");
        // Just verifying it doesn't error and returns a well-formed list — the working
        // tree's actual dirtiness varies run to run.
        for f in &status.files {
            assert!(!f.path.is_empty());
        }
    }

    #[test]
    fn reads_current_branch_of_real_repo() {
        let branch = get_current_branch(&this_repo()).expect("branch should succeed");
        assert!(!branch.is_empty());
    }

    #[test]
    fn lists_branches_of_real_repo() {
        let branches = list_branches(&this_repo()).expect("branches should succeed");
        assert!(branches.iter().any(|b| b.is_head));
    }

    struct ScratchRepo {
        path: std::path::PathBuf,
    }

    impl ScratchRepo {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "gitbud-test-repo-{name}-{}",
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

        fn write_and_commit(&self, file: &str, contents: &str, message: &str) -> String {
            std::fs::write(self.path.join(file), contents).unwrap();
            stage_paths(&self.path_str(), &[file.to_string()]).unwrap();
            commit(&self.path_str(), message, "").unwrap()
        }
    }

    impl Drop for ScratchRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn amend_commit_replaces_head_message_and_content() {
        let scratch = ScratchRepo::new("amend");
        let repo_path = scratch.path_str();
        scratch.write_and_commit("a.txt", "a\n", "first message");

        std::fs::write(scratch.path.join("a.txt"), "a\nb\n").unwrap();
        stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        amend_commit(&repo_path, "amended message", "").unwrap();

        let log = crate::history::get_log(&repo_path, 10, 0).unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].summary, "amended message");
    }

    #[test]
    fn cherry_pick_applies_commit_onto_head() {
        let scratch = ScratchRepo::new("cherry-pick");
        let repo_path = scratch.path_str();
        scratch.write_and_commit("a.txt", "a\n", "base");
        let base_branch = get_current_branch(&repo_path).unwrap();
        create_branch(&repo_path, "feature", true).unwrap();
        let feature_oid = scratch.write_and_commit("b.txt", "b\n", "add b");

        checkout_branch(&repo_path, &base_branch).unwrap();
        let result = cherry_pick(&repo_path, &feature_oid).unwrap();
        assert!(!result.conflicted);
        assert!(scratch.path.join("b.txt").exists());
    }

    #[test]
    fn merge_branch_fast_forwards_when_possible() {
        let scratch = ScratchRepo::new("merge-ff");
        let repo_path = scratch.path_str();
        scratch.write_and_commit("a.txt", "a\n", "base");
        let base_branch = get_current_branch(&repo_path).unwrap();
        create_branch(&repo_path, "feature", true).unwrap();
        scratch.write_and_commit("b.txt", "b\n", "add b");

        checkout_branch(&repo_path, &base_branch).unwrap();
        let result = merge_branch(&repo_path, "feature").unwrap();
        assert!(!result.conflicted);
        assert!(scratch.path.join("b.txt").exists());
    }

    #[test]
    fn delete_and_rename_branch_roundtrip() {
        let scratch = ScratchRepo::new("branch-ops");
        let repo_path = scratch.path_str();
        scratch.write_and_commit("a.txt", "a\n", "base");
        create_branch(&repo_path, "old-name", false).unwrap();

        rename_branch(&repo_path, "old-name", "new-name").unwrap();
        let branches = list_branches(&repo_path).unwrap();
        assert!(branches.iter().any(|b| b.name == "new-name"));
        assert!(!branches.iter().any(|b| b.name == "old-name"));

        delete_branch(&repo_path, "new-name").unwrap();
        let branches = list_branches(&repo_path).unwrap();
        assert!(!branches.iter().any(|b| b.name == "new-name"));
    }

    #[test]
    fn discard_file_removes_untracked_file() {
        let scratch = ScratchRepo::new("discard-untracked");
        let repo_path = scratch.path_str();
        scratch.write_and_commit("a.txt", "a\n", "base");
        std::fs::write(scratch.path.join("new.txt"), "new\n").unwrap();

        discard_file(&repo_path, "new.txt").unwrap();
        assert!(!scratch.path.join("new.txt").exists());
    }

    #[test]
    fn discard_file_restores_tracked_file_to_head() {
        let scratch = ScratchRepo::new("discard-tracked");
        let repo_path = scratch.path_str();
        scratch.write_and_commit("a.txt", "original\n", "base");

        std::fs::write(scratch.path.join("a.txt"), "modified\n").unwrap();
        stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();

        discard_file(&repo_path, "a.txt").unwrap();

        let contents = std::fs::read_to_string(scratch.path.join("a.txt")).unwrap();
        assert_eq!(contents, "original\n");
        let status = get_status(&repo_path).unwrap();
        assert!(status.files.is_empty());
    }
}

pub fn commit(repo_path: &str, summary: &str, description: &str) -> Result<String, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;
    let signature = repo.signature().map_err(|e| e.message().to_string())?;

    let message = if description.trim().is_empty() {
        summary.to_string()
    } else {
        format!("{summary}\n\n{description}")
    };

    let parent_commit = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = parent_commit.iter().collect();

    let oid = repo
        .commit(Some("HEAD"), &signature, &signature, &message, &tree, &parents)
        .map_err(|e| e.message().to_string())?;

    Ok(oid.to_string())
}

pub fn amend_commit(repo_path: &str, summary: &str, description: &str) -> Result<String, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let head_commit = repo
        .head()
        .and_then(|h| h.peel_to_commit())
        .map_err(|e| e.message().to_string())?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;

    let message = if description.trim().is_empty() {
        summary.to_string()
    } else {
        format!("{summary}\n\n{description}")
    };

    let oid = head_commit
        .amend(Some("HEAD"), None, None, None, Some(&message), Some(&tree))
        .map_err(|e| e.message().to_string())?;
    Ok(oid.to_string())
}

/// Applies `oid`'s changes on top of the current HEAD as a new commit. If the cherry-pick
/// produces conflicts, leaves the index/workdir mid-operation for the user to resolve
/// (mirroring plain `git cherry-pick`) instead of silently committing a partial result.
pub fn cherry_pick(repo_path: &str, oid: &str) -> Result<CherryPickResult, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let commit = repo
        .find_commit(git2::Oid::from_str(oid).map_err(|e| e.message().to_string())?)
        .map_err(|e| e.message().to_string())?;

    repo.cherrypick(&commit, None).map_err(|e| e.message().to_string())?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    if index.has_conflicts() {
        return Ok(CherryPickResult { conflicted: true, new_oid: None });
    }

    let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;
    let signature = repo.signature().map_err(|e| e.message().to_string())?;
    let parent = repo.head().and_then(|h| h.peel_to_commit()).map_err(|e| e.message().to_string())?;

    let new_oid = repo
        .commit(
            Some("HEAD"),
            &commit.author(),
            &signature,
            commit.message().unwrap_or(""),
            &tree,
            &[&parent],
        )
        .map_err(|e| e.message().to_string())?;

    repo.cleanup_state().map_err(|e| e.message().to_string())?;
    Ok(CherryPickResult { conflicted: false, new_oid: Some(new_oid.to_string()) })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CherryPickResult {
    pub conflicted: bool,
    pub new_oid: Option<String>,
}

/// Reverts `oid` — applies its inverse on top of HEAD as a new commit. Same
/// conflict-leaves-state-for-the-user behavior as `cherry_pick`.
pub fn revert_commit(repo_path: &str, oid: &str) -> Result<CherryPickResult, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let commit = repo
        .find_commit(git2::Oid::from_str(oid).map_err(|e| e.message().to_string())?)
        .map_err(|e| e.message().to_string())?;

    repo.revert(&commit, None).map_err(|e| e.message().to_string())?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    if index.has_conflicts() {
        return Ok(CherryPickResult { conflicted: true, new_oid: None });
    }

    let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;
    let signature = repo.signature().map_err(|e| e.message().to_string())?;
    let parent = repo.head().and_then(|h| h.peel_to_commit()).map_err(|e| e.message().to_string())?;

    let summary = commit.summary().unwrap_or("");
    let message = format!(
        "Revert \"{summary}\"\n\nThis reverts commit {}.",
        commit.id()
    );

    let new_oid = repo
        .commit(Some("HEAD"), &signature, &signature, &message, &tree, &[&parent])
        .map_err(|e| e.message().to_string())?;

    repo.cleanup_state().map_err(|e| e.message().to_string())?;
    Ok(CherryPickResult { conflicted: false, new_oid: Some(new_oid.to_string()) })
}

pub fn delete_branch(repo_path: &str, name: &str) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut branch = repo
        .find_branch(name, git2::BranchType::Local)
        .map_err(|e| e.message().to_string())?;
    branch.delete().map_err(|e| e.message().to_string())
}

pub fn rename_branch(repo_path: &str, old_name: &str, new_name: &str) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut branch = repo
        .find_branch(old_name, git2::BranchType::Local)
        .map_err(|e| e.message().to_string())?;
    branch
        .rename(new_name, false)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

/// Merges `branch_name` into the currently checked-out branch. Fast-forwards when possible;
/// otherwise performs a real merge commit, or reports conflicts for the user to resolve.
pub fn merge_branch(repo_path: &str, branch_name: &str) -> Result<CherryPickResult, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let branch = repo
        .find_branch(branch_name, git2::BranchType::Local)
        .map_err(|e| e.message().to_string())?;
    let their_commit = branch.get().peel_to_commit().map_err(|e| e.message().to_string())?;
    let annotated = repo
        .find_annotated_commit(their_commit.id())
        .map_err(|e| e.message().to_string())?;

    let (analysis, _) = repo.merge_analysis(&[&annotated]).map_err(|e| e.message().to_string())?;

    if analysis.is_up_to_date() {
        return Ok(CherryPickResult { conflicted: false, new_oid: None });
    }

    if analysis.is_fast_forward() {
        let head_ref = repo.head().map_err(|e| e.message().to_string())?;
        let ref_name = head_ref.name().ok_or("HEAD has no ref name")?.to_string();
        let mut reference = repo
            .find_reference(&ref_name)
            .map_err(|e| e.message().to_string())?;
        reference
            .set_target(their_commit.id(), "fast-forward merge")
            .map_err(|e| e.message().to_string())?;
        repo.set_head(&ref_name).map_err(|e| e.message().to_string())?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .map_err(|e| e.message().to_string())?;
        return Ok(CherryPickResult { conflicted: false, new_oid: Some(their_commit.id().to_string()) });
    }

    repo.merge(&[&annotated], None, None).map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    if index.has_conflicts() {
        return Ok(CherryPickResult { conflicted: true, new_oid: None });
    }

    let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;
    let signature = repo.signature().map_err(|e| e.message().to_string())?;
    let head_commit = repo.head().and_then(|h| h.peel_to_commit()).map_err(|e| e.message().to_string())?;

    let message = format!("Merge branch '{branch_name}'");
    let new_oid = repo
        .commit(Some("HEAD"), &signature, &signature, &message, &tree, &[&head_commit, &their_commit])
        .map_err(|e| e.message().to_string())?;
    repo.cleanup_state().map_err(|e| e.message().to_string())?;
    Ok(CherryPickResult { conflicted: false, new_oid: Some(new_oid.to_string()) })
}
