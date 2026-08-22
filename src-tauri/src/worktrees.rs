use git2::{Repository, WorktreeLockStatus};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub is_locked: bool,
    pub is_main: bool,
}

pub fn list_worktrees(repo_path: &str) -> Result<Vec<WorktreeInfo>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;

    let mut result = Vec::new();
    if let Some(main_path) = repo.workdir() {
        let branch = repo.head().ok().and_then(|h| h.shorthand().map(|s| s.to_string()));
        result.push(WorktreeInfo {
            name: "(main)".to_string(),
            path: main_path.to_string_lossy().trim_end_matches('/').to_string(),
            branch,
            is_locked: false,
            is_main: true,
        });
    }

    let names = repo.worktrees().map_err(|e| e.message().to_string())?;
    for name in names.iter().flatten() {
        let wt = repo.find_worktree(name).map_err(|e| e.message().to_string())?;
        let path = wt.path().to_string_lossy().to_string();
        let is_locked = matches!(wt.is_locked(), Ok(WorktreeLockStatus::Locked(_)));
        let branch = Repository::open(&path)
            .ok()
            .and_then(|r| r.head().ok().and_then(|h| h.shorthand().map(|s| s.to_string())));
        result.push(WorktreeInfo {
            name: name.to_string(),
            path,
            branch,
            is_locked,
            is_main: false,
        });
    }
    Ok(result)
}

/// Adds a worktree at `path`. When `create_branch` is set, `branch` is created fresh (off the
/// current HEAD); otherwise `branch` must already exist and is checked out into the new
/// worktree.
pub fn add_worktree(repo_path: &str, path: &str, branch: &str, create_branch: bool) -> Result<(), String> {
    let mut command = std::process::Command::new(crate::settings::git_binary());
    command.current_dir(repo_path);
    if create_branch {
        command.args(["worktree", "add", "-b", branch, path]);
    } else {
        command.args(["worktree", "add", path, branch]);
    }
    let output = command.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Removes a worktree. `force` discards it even with uncommitted changes or untracked files.
pub fn remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<(), String> {
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(worktree_path);
    let output = std::process::Command::new(crate::settings::git_binary())
        .current_dir(repo_path)
        .args(&args)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
