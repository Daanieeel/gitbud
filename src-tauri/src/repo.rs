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
