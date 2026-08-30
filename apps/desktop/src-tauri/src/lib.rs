mod blame;
mod commit_service;
mod config;
mod diff;
mod git_shell;
mod github;
mod history;
mod hunk;
mod image_diff;
mod lfs;
mod merge3;
mod pr_cache;
mod rebase;
mod reflog;
mod repo;
mod repo_icon;
mod settings;
mod signing;
mod ssh_identity;
mod stash;
mod submodules;
mod system;
mod tags;
mod watch;
mod workspaces;
mod worktrees;

use base64::{engine::general_purpose::STANDARD, Engine};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct AppState {
    watchers: Mutex<HashMap<String, notify::RecommendedWatcher>>,
}

// --- repo status / branches / staging / commit ---

#[tauri::command]
async fn get_status(repo_path: String) -> Result<repo::RepoStatus, String> {
    tauri::async_runtime::spawn_blocking(move || repo::get_status(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn is_dirty(repo_path: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || repo::is_dirty(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_current_branch(repo_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || repo::get_current_branch(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_branches(repo_path: String) -> Result<Vec<repo::BranchInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || repo::list_branches(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn checkout_branch(repo_path: String, branch: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::checkout_branch(&repo_path, &branch))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_branch(repo_path: String, name: String, checkout: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::create_branch(&repo_path, &name, checkout))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_branch_at(
    repo_path: String,
    name: String,
    oid: String,
    checkout: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        repo::create_branch_at(&repo_path, &name, &oid, checkout)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stage_paths(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::stage_paths(&repo_path, &paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn unstage_paths(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::unstage_paths(&repo_path, &paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn discard_file(repo_path: String, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::discard_file(&repo_path, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn discard_files(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::discard_files(&repo_path, &paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_to_gitignore(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::add_to_gitignore(&repo_path, &paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ignore_folder(repo_path: String, folder_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::ignore_folder(&repo_path, &folder_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ignore_extension(repo_path: String, extension: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::ignore_extension(&repo_path, &extension))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn resolve_conflict(repo_path: String, path: String, side: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::resolve_conflict(&repo_path, &path, &side))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_working_file(repo_path: String, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::read_to_string(std::path::Path::new(&repo_path).join(&path))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stage_hunk(repo_path: String, path: String, hunk_index: usize) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || hunk::stage_hunk(&repo_path, &path, hunk_index))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stage_hunk_lines(
    repo_path: String,
    path: String,
    hunk_index: usize,
    line_indices: Vec<usize>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        hunk::stage_hunk_lines(&repo_path, &path, hunk_index, &line_indices)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn unstage_hunk(repo_path: String, path: String, hunk_index: usize) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || hunk::unstage_hunk(&repo_path, &path, hunk_index))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn unstage_hunk_lines(
    repo_path: String,
    path: String,
    hunk_index: usize,
    line_indices: Vec<usize>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        hunk::unstage_hunk_lines(&repo_path, &path, hunk_index, &line_indices)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn discard_hunk(repo_path: String, path: String, hunk_index: usize) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || hunk::discard_hunk(&repo_path, &path, hunk_index))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn discard_hunk_lines(
    repo_path: String,
    path: String,
    hunk_index: usize,
    line_indices: Vec<usize>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        hunk::discard_hunk_lines(&repo_path, &path, hunk_index, &line_indices)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn commit(repo_path: String, summary: String, description: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || repo::commit(&repo_path, &summary, &description))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_fixup_commit(repo_path: String, target_oid: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || repo::create_fixup_commit(&repo_path, &target_oid))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn amend_commit(
    repo_path: String,
    summary: String,
    description: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        repo::amend_commit(&repo_path, &summary, &description)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn undo_last_commit(repo_path: String) -> Result<(String, String), String> {
    tauri::async_runtime::spawn_blocking(move || repo::undo_last_commit(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cherry_pick(repo_path: String, oid: String) -> Result<repo::CherryPickResult, String> {
    tauri::async_runtime::spawn_blocking(move || repo::cherry_pick(&repo_path, &oid))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn revert_commit(repo_path: String, oid: String) -> Result<repo::CherryPickResult, String> {
    tauri::async_runtime::spawn_blocking(move || repo::revert_commit(&repo_path, &oid))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_branch(repo_path: String, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::delete_branch(&repo_path, &name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_branch_remote(
    app: AppHandle,
    repo_path: String,
    name: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::delete_branch_remote(&app, &repo_path, &name, &repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn is_branch_merged(
    repo_path: String,
    branch: String,
    target: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        repo::is_branch_merged(&repo_path, &branch, &target)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn rename_branch(
    repo_path: String,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        repo::rename_branch(&repo_path, &old_name, &new_name)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn rename_branch_remote(
    app: AppHandle,
    repo_path: String,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::rename_branch_remote(&app, &repo_path, &old_name, &new_name, &repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn merge_branch(
    repo_path: String,
    branch_name: String,
) -> Result<repo::CherryPickResult, String> {
    tauri::async_runtime::spawn_blocking(move || repo::merge_branch(&repo_path, &branch_name))
        .await
        .map_err(|e| e.to_string())?
}

// --- diffs ---

#[tauri::command]
async fn get_file_diff(
    repo_path: String,
    path: String,
    staged: bool,
) -> Result<diff::FileDiff, String> {
    tauri::async_runtime::spawn_blocking(move || diff::get_file_diff(&repo_path, &path, staged))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_commit_files(repo_path: String, oid: String) -> Result<Vec<(String, String)>, String> {
    tauri::async_runtime::spawn_blocking(move || diff::get_commit_files(&repo_path, &oid))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_commit_file_diff(
    repo_path: String,
    oid: String,
    path: String,
) -> Result<diff::FileDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        diff::get_commit_file_diff(&repo_path, &oid, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_branch_diff_files(
    repo_path: String,
    base: String,
    head: String,
) -> Result<Vec<(String, String)>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        diff::get_branch_diff_files(&repo_path, &base, &head)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_branch_diff_file(
    repo_path: String,
    base: String,
    head: String,
    path: String,
) -> Result<diff::FileDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        diff::get_branch_diff_file(&repo_path, &base, &head, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_branch_image_diff(
    repo_path: String,
    base: String,
    head: String,
    path: String,
) -> Result<image_diff::ImageDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        image_diff::get_branch_image_diff(&repo_path, &base, &head, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_image_diff(
    repo_path: String,
    path: String,
    staged: bool,
) -> Result<image_diff::ImageDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        image_diff::get_image_diff(&repo_path, &path, staged)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_commit_image_diff(
    repo_path: String,
    oid: String,
    path: String,
) -> Result<image_diff::ImageDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        image_diff::get_commit_image_diff(&repo_path, &oid, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- history ---

#[tauri::command]
async fn get_log(
    repo_path: String,
    limit: usize,
    skip: usize,
) -> Result<Vec<history::CommitEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || history::get_log(&repo_path, limit, skip))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_commit_detail(
    repo_path: String,
    oid: String,
) -> Result<history::CommitDetail, String> {
    tauri::async_runtime::spawn_blocking(move || history::get_commit_detail(&repo_path, &oid))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn search_commits(
    repo_path: String,
    query: String,
    limit: usize,
) -> Result<Vec<history::CommitSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || history::search_commits(&repo_path, &query, limit))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_branch_commits(
    repo_path: String,
    base: String,
    head: String,
) -> Result<Vec<history::CommitSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        history::get_branch_commits(&repo_path, &base, &head)
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- tags ---

#[tauri::command]
async fn list_tags(repo_path: String) -> Result<Vec<tags::TagInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || tags::list_tags(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_tag(repo_path: String, name: String, message: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || tags::create_tag(&repo_path, &name, &message))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_tag(repo_path: String, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || tags::delete_tag(&repo_path, &name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn push_tag(app: AppHandle, repo_path: String, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::push_ref(&app, &repo_path, &name, &repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn interactive_rebase(
    repo_path: String,
    base_oid: String,
    todo: Vec<rebase::RebaseTodoItem>,
) -> Result<rebase::RebaseResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        rebase::interactive_rebase(&repo_path, &base_oid, &todo)
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- submodules ---

#[tauri::command]
async fn list_submodules(repo_path: String) -> Result<Vec<submodules::SubmoduleInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || submodules::list_submodules(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_submodule(
    app: AppHandle,
    repo_path: String,
    submodule_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::update_submodule(&app, &repo_path, &submodule_path, &repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_all_submodules(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::update_all_submodules(&app, &repo_path, &repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- blame ---

#[tauri::command]
async fn blame_file(repo_path: String, path: String) -> Result<Vec<blame::BlameLine>, String> {
    tauri::async_runtime::spawn_blocking(move || blame::blame_file(&repo_path, &path))
        .await
        .map_err(|e| e.to_string())?
}

// --- repo list config ---

#[tauri::command]
async fn load_repos() -> Result<Vec<config::RepoEntry>, String> {
    tauri::async_runtime::spawn_blocking(config::load_repos)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_repo(path: String) -> Result<Vec<config::RepoEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || config::add_repo(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_repo(path: String) -> Result<Vec<config::RepoEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || config::remove_repo(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Moves a repo's local folder to the OS trash (Recycle Bin / Trash / freedesktop trash,
/// depending on platform) — a separate, opt-in step from `remove_repo`, which only ever drops
/// the repo from GitBud's list and never touches the filesystem.
#[tauri::command]
async fn move_repo_to_trash(repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        trash::delete(&repo_path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_repo_section(path: String, section: String) -> Result<Vec<config::RepoEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || config::add_repo_section(&path, &section))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_repo_section(
    path: String,
    section: String,
) -> Result<Vec<config::RepoEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || config::remove_repo_section(&path, &section))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_section(section: String) -> Result<Vec<config::RepoEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || config::remove_section(&section))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn rename_section(old: String, new: String) -> Result<Vec<config::RepoEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || config::rename_section(&old, &new))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_repo_identity(
    path: String,
    identity_id: Option<String>,
) -> Result<Vec<config::RepoEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || config::set_repo_identity(&path, identity_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_repo_order(order: Vec<String>) -> Result<Vec<config::RepoEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || config::set_repo_order(&order))
        .await
        .map_err(|e| e.to_string())?
}

// --- workspaces: user-defined saved sets of repos ---

#[tauri::command]
async fn list_workspaces() -> Result<Vec<workspaces::Workspace>, String> {
    tauri::async_runtime::spawn_blocking(workspaces::list)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_workspace(
    name: String,
    repo_paths: Vec<String>,
) -> Result<Vec<workspaces::Workspace>, String> {
    tauri::async_runtime::spawn_blocking(move || workspaces::create(&name, repo_paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_workspace(
    id: String,
    name: String,
    repo_paths: Vec<String>,
) -> Result<Vec<workspaces::Workspace>, String> {
    tauri::async_runtime::spawn_blocking(move || workspaces::update(&id, &name, repo_paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_workspace(id: String) -> Result<Vec<workspaces::Workspace>, String> {
    tauri::async_runtime::spawn_blocking(move || workspaces::remove(&id))
        .await
        .map_err(|e| e.to_string())?
}

// --- worktrees ---

#[tauri::command]
async fn list_worktrees(repo_path: String) -> Result<Vec<worktrees::WorktreeInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || worktrees::list_worktrees(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_worktree(
    repo_path: String,
    path: String,
    branch: String,
    create_branch: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        worktrees::add_worktree(&repo_path, &path, &branch, create_branch)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_worktree(
    repo_path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        worktrees::remove_worktree(&repo_path, &worktree_path, force)
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- reflog / undo ---

#[tauri::command]
async fn get_reflog(repo_path: String) -> Result<Vec<reflog::ReflogEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || reflog::get_reflog(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn reflog_restore(repo_path: String, oid: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || reflog::restore_to(&repo_path, &oid))
        .await
        .map_err(|e| e.to_string())?
}

// --- Git LFS awareness ---

#[tauri::command]
async fn has_lfs(repo_path: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || lfs::has_lfs(&repo_path))
        .await
        .unwrap_or(false)
}

#[tauri::command]
async fn check_lfs_files(
    repo_path: String,
    paths: Vec<String>,
) -> Result<Vec<lfs::LfsFileInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || lfs::check_lfs_files(&repo_path, &paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_lfs_pull(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git_shell::lfs_pull(&app, &repo_path, &repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_lfs_push(app: AppHandle, repo_path: String, branch: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::lfs_push(&app, &repo_path, &branch, &repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- 3-way merge conflict view ---

#[tauri::command]
async fn get_conflict_sides(
    repo_path: String,
    path: String,
) -> Result<merge3::ConflictSides, String> {
    tauri::async_runtime::spawn_blocking(move || merge3::get_conflict_sides(&repo_path, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn resolve_conflict_with_content(
    repo_path: String,
    path: String,
    content: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        merge3::resolve_conflict_with_content(&repo_path, &path, &content)
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- commit signing (GPG or SSH) ---

#[tauri::command]
async fn has_gpg() -> bool {
    tauri::async_runtime::spawn_blocking(signing::has_gpg)
        .await
        .unwrap_or(false)
}

#[tauri::command]
async fn install_gpg_via_brew() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(signing::install_gpg_via_brew)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_gpg_keys() -> Result<Vec<(String, String)>, String> {
    tauri::async_runtime::spawn_blocking(signing::list_gpg_keys)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn generate_gpg_key(name: String, email: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || signing::generate_gpg_key(&name, &email))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn generate_ssh_signing_key(path: String, email: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || signing::generate_ssh_signing_key(&path, &email))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn configure_signing(
    repo_path: String,
    format: String,
    signing_key: String,
    global: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        signing::configure_signing(&repo_path, &format, &signing_key, global)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn disable_signing(repo_path: String, global: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || signing::disable_signing(&repo_path, global))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_signing_status(repo_path: String) -> Result<signing::SigningStatus, String> {
    tauri::async_runtime::spawn_blocking(move || signing::get_signing_status(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_gpg_public_key(key_id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || signing::export_gpg_public_key(&key_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_ssh_public_key(pub_key_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || signing::read_ssh_public_key(&pub_key_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn test_signing(format: String, key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || signing::test_signing(&format, &key))
        .await
        .map_err(|e| e.to_string())?
}

/// Best-effort: whether `login`'s GitHub account already has this SSH pubkey registered as a
/// signing key. Returns `Ok(false)` (not an error) when the check itself can't be answered —
/// e.g. an older sign-in without the `read:public_key` scope — since that's meant to fail open
/// into "show the manual confirm checkbox", not block the wizard.
#[tauri::command]
async fn github_has_ssh_signing_key(login: String, pubkey: String) -> Result<bool, String> {
    let host = github::auth::get_host()?;
    let token = github::auth::get_token(&login)?;
    Ok(github::api::has_ssh_signing_key(&host, &token, &pubkey)
        .await
        .unwrap_or(false))
}

#[tauri::command]
async fn github_has_gpg_key(login: String, key_id: String) -> Result<bool, String> {
    let host = github::auth::get_host()?;
    let token = github::auth::get_token(&login)?;
    Ok(github::api::has_gpg_key(&host, &token, &key_id)
        .await
        .unwrap_or(false))
}

// --- git identities: GitHub accounts (see github/) plus plain SSH-key identities ---

#[tauri::command]
async fn list_ssh_identities() -> Result<Vec<ssh_identity::SshIdentity>, String> {
    tauri::async_runtime::spawn_blocking(ssh_identity::list)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_ssh_identity(
    label: String,
    host: String,
    key_path: String,
) -> Result<Vec<ssh_identity::SshIdentity>, String> {
    tauri::async_runtime::spawn_blocking(move || ssh_identity::add(&label, &host, &key_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_ssh_identity(id: String) -> Result<Vec<ssh_identity::SshIdentity>, String> {
    tauri::async_runtime::spawn_blocking(move || ssh_identity::remove(&id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn apply_ssh_identity_to_repo(repo_path: String, key_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || ssh_identity::apply_to_repo(&repo_path, &key_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn clear_ssh_identity_from_repo(repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || ssh_identity::clear_from_repo(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn init_repo(path: String, default_branch: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let default_branch = default_branch
            .filter(|b| !b.trim().is_empty())
            .unwrap_or_else(|| {
                settings::get_settings()
                    .map(|s| s.default_branch_name)
                    .unwrap_or_else(|_| "main".to_string())
            });
        let mut opts = git2::RepositoryInitOptions::new();
        opts.initial_head(&default_branch);
        git2::Repository::init_opts(&path, &opts).map_err(|e| e.message().to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// Generic write used right after `init_repo` to drop a README/.gitignore/LICENSE into a freshly
// created repo, and reusable later by the planned in-app .gitignore editor.
#[tauri::command]
async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(&path, contents).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// Best-effort default for pre-filling a license's copyright line before a repo (and thus its own
// git config) exists — falls back to empty strings the caller can leave blank.
#[tauri::command]
async fn get_global_git_identity() -> (Option<String>, Option<String>) {
    tauri::async_runtime::spawn_blocking(|| {
        let config = match git2::Config::open_default() {
            Ok(c) => c,
            Err(_) => return (None, None),
        };
        (
            config.get_string("user.name").ok(),
            config.get_string("user.email").ok(),
        )
    })
    .await
    .unwrap_or((None, None))
}

// --- stash ---

#[tauri::command]
async fn list_stashes(repo_path: String) -> Result<Vec<stash::StashEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || stash::list_stashes(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stash_save(
    repo_path: String,
    message: String,
    include_untracked: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        stash::stash_save(&repo_path, &message, include_untracked)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stash_apply(repo_path: String, index: usize) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stash::stash_apply(&repo_path, index))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stash_pop(repo_path: String, index: usize) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stash::stash_pop(&repo_path, index))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stash_drop(repo_path: String, index: usize) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stash::stash_drop(&repo_path, index))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_stash_oid(repo_path: String, index: usize) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || stash::stash_oid(&repo_path, index))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stash_apply_file(repo_path: String, index: usize, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stash::stash_apply_file(&repo_path, index, &path))
        .await
        .map_err(|e| e.to_string())?
}

// --- sync: fetch/pull/push/clone via system git ---

#[tauri::command]
async fn git_fetch(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::fetch(&app, &repo_path, &repo_path)?;
        let now = chrono::Utc::now().timestamp();
        config::touch_last_fetched(&repo_path, now)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_pull(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git_shell::pull(&app, &repo_path, &repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_pull_with_strategy(
    app: AppHandle,
    repo_path: String,
    strategy: settings::PullStrategy,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::pull_with_strategy(&app, &repo_path, &repo_path, strategy)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_abort_pull(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::abort_pull(&app, &repo_path, &repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_push(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git_shell::push(&app, &repo_path, &repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_publish(app: AppHandle, repo_path: String, url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::add_remote_and_push(&app, &repo_path, &url, &repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_clone(app: AppHandle, url: String, dest: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git_shell::clone(&app, &url, &dest, &dest))
        .await
        .map_err(|e| e.to_string())?
}

// Dispatched the same way (spawn_blocking) as the git ops it cancels: if fetch/pull/push are
// starving tokio's worker threads with a long blocking git subprocess wait, a plain blocking
// command here would queue behind them and never run, leaving no way to actually cancel.
#[tauri::command]
async fn cancel_git_operation(repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git_shell::cancel(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_ahead_behind(repo_path: String) -> Result<git_shell::AheadBehind, String> {
    tauri::async_runtime::spawn_blocking(move || git_shell::get_ahead_behind(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn has_upstream_remote(repo_path: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || git_shell::has_remote(&repo_path, "upstream"))
        .await
        .unwrap_or(false)
}

#[tauri::command]
async fn has_origin_remote(repo_path: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || git_shell::has_remote(&repo_path, "origin"))
        .await
        .unwrap_or(false)
}

/// Host and best-effort web URL for a repo's `origin` remote, regardless of which forge it's
/// hosted on (GitHub, GitLab, Bitbucket, self-hosted, ...).
#[tauri::command]
async fn remote_web_info(repo_path: String) -> Option<(String, String)> {
    tauri::async_runtime::spawn_blocking(move || config::remote_web_info(&repo_path))
        .await
        .unwrap_or(None)
}

#[tauri::command]
async fn get_upstream_ahead_behind(
    repo_path: String,
    branch: String,
) -> Result<Option<git_shell::AheadBehind>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::get_upstream_ahead_behind(&repo_path, &branch)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sync_upstream(app: AppHandle, repo_path: String, branch: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::sync_upstream(&app, &repo_path, &branch, &repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn checkout_pull_request(
    app: AppHandle,
    repo_path: String,
    number: u64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::checkout_pull_request(&app, &repo_path, number, &repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- github: auth ---

#[tauri::command]
async fn github_get_client_id() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(github::auth::get_client_id)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn github_set_client_id(client_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || github::auth::set_client_id(&client_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn github_get_host() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(github::auth::get_host)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn github_set_host(host: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || github::auth::set_host(&host))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn github_list_accounts() -> Result<Vec<github::auth::Account>, String> {
    tauri::async_runtime::spawn_blocking(github::auth::list_accounts)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn github_remove_account(login: String) -> Result<Vec<github::auth::Account>, String> {
    tauri::async_runtime::spawn_blocking(move || github::auth::remove_account(&login))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn github_has_token(login: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        let has = github::auth::has_token(&login);
        println!("github_has_token({}): {}", login, has);
        has
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
async fn github_detect_gh_cli() -> Result<Option<github::auth::Account>, String> {
    github::auth::detect_gh_cli().await
}

#[tauri::command]
async fn github_start_device_flow(
    client_id: String,
) -> Result<github::auth::DeviceCodeResponse, String> {
    let host = github::auth::get_host()?;
    github::auth::start_device_flow(&host, &client_id).await
}

#[tauri::command]
async fn github_poll_device_flow(
    client_id: String,
    device_code: String,
) -> Result<github::auth::PollResult, String> {
    let host = github::auth::get_host()?;
    github::auth::poll_device_flow(&host, &client_id, &device_code).await
}

// --- github: pull requests ---

fn github_resolve(
    repo_path: &str,
    login: &str,
) -> Result<(String, String, String, String), String> {
    let host = github::auth::get_host()?;
    let token = github::auth::get_token(login)?;
    let (owner, repo) = config::remote_owner_repo(repo_path)
        .ok_or("repository has no GitHub-style origin remote")?;
    Ok((host, token, owner, repo))
}

/// Key for the local PR/CI SQLite mirror (see `pr_cache.rs`) — the repo's `(host, owner, repo)`
/// identity rather than its local filesystem path, so renaming or moving the repo's folder on
/// disk doesn't orphan its offline cache. Doesn't need a token/login, unlike `github_resolve`.
fn cache_key(repo_path: &str) -> Result<String, String> {
    let host = github::auth::get_host()?;
    let (owner, repo) = config::remote_owner_repo(repo_path)
        .ok_or("repository has no GitHub-style origin remote")?;
    Ok(format!("{host}/{owner}/{repo}"))
}

/// Runs a `pr_cache` write on the blocking pool and logs (rather than silently discarding) any
/// failure — the mirror is best-effort and must never fail the command it's piggybacking on, but
/// a write that silently vanishes (e.g. under SQLite lock contention) shouldn't be invisible.
async fn cache_write<F>(f: F)
where
    F: FnOnce() -> Result<(), String> + Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(f).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => eprintln!("pr_cache write failed: {e}"),
        Err(e) => eprintln!("pr_cache write task failed: {e}"),
    }
}

#[tauri::command]
async fn github_remote_owner_repo(repo_path: String) -> Option<(String, String)> {
    tauri::async_runtime::spawn_blocking(move || config::remote_owner_repo(&repo_path))
        .await
        .unwrap_or(None)
}

#[tauri::command]
async fn github_list_pull_requests(
    repo_path: String,
    login: String,
    state: String,
    page: u32,
) -> Result<Vec<github::api::PullRequest>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    let prs = github::api::list_pull_requests(&host, &token, &owner, &repo, &state, page).await?;
    if let Ok(key) = cache_key(&repo_path) {
        let list = prs.clone();
        cache_write(move || pr_cache::upsert_pr_list(&key, &list)).await;
    }
    Ok(prs)
}

#[tauri::command]
async fn get_cached_pull_requests(
    repo_path: String,
    state: String,
) -> Vec<github::api::PullRequest> {
    let Ok(key) = cache_key(&repo_path) else {
        return Vec::new();
    };
    tauri::async_runtime::spawn_blocking(move || pr_cache::get_cached_pr_list(&key, &state))
        .await
        .unwrap_or(Ok(Vec::new()))
        .unwrap_or_default()
}

#[tauri::command]
async fn github_get_pull_request(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<github::api::PullRequest, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::get_pull_request(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_create_pull_request(
    repo_path: String,
    login: String,
    title: String,
    head: String,
    base: String,
    body: String,
    draft: bool,
) -> Result<github::api::PullRequest, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::create_pull_request(
        &host, &token, &owner, &repo, &title, &head, &base, &body, draft,
    )
    .await
}

#[tauri::command]
async fn github_update_pull_request_base(
    repo_path: String,
    login: String,
    number: u64,
    base: String,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::update_pull_request_base(&host, &token, &owner, &repo, number, &base).await
}

#[tauri::command]
async fn github_update_pull_request_body(
    repo_path: String,
    login: String,
    number: u64,
    body: String,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::update_pull_request_body(&host, &token, &owner, &repo, number, &body).await
}

#[tauri::command]
async fn github_close_pull_request(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::close_pull_request(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_reopen_pull_request(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::reopen_pull_request(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_lock_conversation(
    repo_path: String,
    login: String,
    number: u64,
    lock_reason: Option<String>,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::lock_conversation(&host, &token, &owner, &repo, number, lock_reason.as_deref())
        .await
}

#[tauri::command]
async fn github_unlock_conversation(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::unlock_conversation(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_update_pull_request_branch(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::update_pull_request_branch(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_compare_pull_request_base(
    repo_path: String,
    login: String,
    base: String,
    head: String,
) -> Result<github::api::CompareResult, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::compare_commits(&host, &token, &owner, &repo, &base, &head).await
}

#[tauri::command]
async fn github_list_labels(
    repo_path: String,
    login: String,
) -> Result<Vec<github::api::Label>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_labels(&host, &token, &owner, &repo).await
}

#[tauri::command]
async fn github_list_assignable_users(
    repo_path: String,
    login: String,
) -> Result<Vec<github::api::AssignableUser>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_assignable_users(&host, &token, &owner, &repo).await
}

#[tauri::command]
async fn github_add_labels(
    repo_path: String,
    login: String,
    number: u64,
    labels: Vec<String>,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::add_labels(&host, &token, &owner, &repo, number, &labels).await
}

#[tauri::command]
async fn github_add_assignees(
    repo_path: String,
    login: String,
    number: u64,
    assignees: Vec<String>,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::add_assignees(&host, &token, &owner, &repo, number, &assignees).await
}

#[tauri::command]
async fn github_remove_assignees(
    repo_path: String,
    login: String,
    number: u64,
    assignees: Vec<String>,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::remove_assignees(&host, &token, &owner, &repo, number, &assignees).await
}

#[tauri::command]
async fn github_remove_label(
    repo_path: String,
    login: String,
    number: u64,
    name: String,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::remove_label(&host, &token, &owner, &repo, number, &name).await
}

#[tauri::command]
async fn github_request_reviewers(
    repo_path: String,
    login: String,
    number: u64,
    reviewers: Vec<String>,
    team_reviewers: Vec<String>,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::request_reviewers(
        &host,
        &token,
        &owner,
        &repo,
        number,
        &reviewers,
        &team_reviewers,
    )
    .await
}

#[tauri::command]
async fn github_list_repo_teams(
    repo_path: String,
    login: String,
) -> Result<Vec<github::api::Team>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_repo_teams(&host, &token, &owner, &repo).await
}

#[tauri::command]
async fn github_remove_requested_reviewers(
    repo_path: String,
    login: String,
    number: u64,
    reviewers: Vec<String>,
    team_reviewers: Vec<String>,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::remove_requested_reviewers(
        &host,
        &token,
        &owner,
        &repo,
        number,
        &reviewers,
        &team_reviewers,
    )
    .await
}

#[tauri::command]
async fn github_list_milestones(
    repo_path: String,
    login: String,
) -> Result<Vec<github::api::Milestone>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_milestones(&host, &token, &owner, &repo).await
}

#[tauri::command]
async fn github_set_milestone(
    repo_path: String,
    login: String,
    number: u64,
    milestone: u64,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::set_milestone(&host, &token, &owner, &repo, number, milestone).await
}

#[tauri::command]
async fn github_clear_milestone(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::clear_milestone(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_list_projects(
    repo_path: String,
    login: String,
) -> Result<Vec<github::api::Project>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_projects(&host, &token, &owner, &repo).await
}

#[tauri::command]
async fn github_add_pull_request_to_project(
    repo_path: String,
    login: String,
    number: u64,
    project_id: String,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::add_pull_request_to_project(&host, &token, &owner, &repo, number, &project_id)
        .await
}

#[tauri::command]
async fn github_list_check_runs(
    repo_path: String,
    login: String,
    sha: String,
) -> Result<Vec<github::api::CheckRun>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    let runs = github::api::list_check_runs(&host, &token, &owner, &repo, &sha).await?;
    if let Ok(key) = cache_key(&repo_path) {
        let (s, to_cache) = (sha.clone(), runs.clone());
        cache_write(move || pr_cache::upsert_check_runs(&key, &s, &to_cache)).await;
    }
    Ok(runs)
}

#[tauri::command]
async fn get_cached_check_runs(
    repo_path: String,
    sha: String,
) -> Option<Vec<github::api::CheckRun>> {
    let key = cache_key(&repo_path).ok()?;
    tauri::async_runtime::spawn_blocking(move || pr_cache::get_cached_check_runs(&key, &sha))
        .await
        .unwrap_or(Ok(None))
        .unwrap_or(None)
}

#[tauri::command]
async fn github_list_pull_request_commits(
    repo_path: String,
    login: String,
    number: u64,
    head_sha: String,
    page: u32,
) -> Result<Vec<github::api::PullRequestCommit>, String> {
    // Only the first page is mirrored to the SQLite cache — later pages are fetched live only,
    // same convention `usePullRequestList`'s own cached-seed step already uses (it only seeds
    // page 1 too). A PR with more than one page of commits is rare enough that "page 2+ needs a
    // live connection" isn't worth a paginated cache schema.
    if page == 1 {
        if let Ok(key) = cache_key(&repo_path) {
            let (lookup_key, sha) = (key.clone(), head_sha.clone());
            if let Ok(Some(cached)) = tauri::async_runtime::spawn_blocking(move || {
                pr_cache::get_cached_commits(&lookup_key, number, &sha)
            })
            .await
            .unwrap_or(Ok(None))
            {
                return Ok(cached);
            }
        }
    }

    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    let commits = github::api::list_pull_request_commits_for_display(
        &host, &token, &owner, &repo, number, page,
    )
    .await?;
    if page == 1 {
        if let Ok(key) = cache_key(&repo_path) {
            let (sha, to_cache) = (head_sha.clone(), commits.clone());
            cache_write(move || pr_cache::upsert_commits(&key, number, &sha, &to_cache)).await;
        }
    }
    Ok(commits)
}

#[tauri::command]
async fn get_cached_pull_request_commits(
    repo_path: String,
    number: u64,
) -> Option<Vec<github::api::PullRequestCommit>> {
    let key = cache_key(&repo_path).ok()?;
    tauri::async_runtime::spawn_blocking(move || pr_cache::get_any_cached_commits(&key, number))
        .await
        .unwrap_or(Ok(None))
        .unwrap_or(None)
}

#[tauri::command]
async fn github_get_commit_diff_files(
    repo_path: String,
    login: String,
    sha: String,
) -> Result<Vec<(String, String, diff::FileDiff)>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::get_commit_diff_files(&host, &token, &owner, &repo, &sha).await
}

/// Pure local-cache read, for the offline fallback path; never touches the network.
#[tauri::command]
async fn get_cached_avatar(url: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || pr_cache::get_cached_avatar(&url))
        .await
        .unwrap_or(Ok(None))
        .unwrap_or(None)
}

/// Warms the local avatar cache for offline use: a no-op (fast SQLite read) if already cached,
/// otherwise fetches and stores it. Avatar URLs are public, no auth needed.
#[tauri::command]
async fn cache_avatar(url: String) -> Option<String> {
    let lookup_url = url.clone();
    if let Ok(Some(cached)) =
        tauri::async_runtime::spawn_blocking(move || pr_cache::get_cached_avatar(&lookup_url))
            .await
            .unwrap_or(Ok(None))
    {
        return Some(cached);
    }

    let resp = reqwest::get(&url).await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    let bytes = resp.bytes().await.ok()?;
    let data_uri = format!("data:{content_type};base64,{}", STANDARD.encode(&bytes));

    let (store_url, store_data) = (url, data_uri.clone());
    let _ = tauri::async_runtime::spawn_blocking(move || {
        pr_cache::upsert_avatar(&store_url, &store_data)
    })
    .await;
    Some(data_uri)
}

#[tauri::command]
async fn github_get_commit_verification(
    repo_path: String,
    login: String,
    sha: String,
) -> Result<github::api::CommitVerification, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::get_commit_verification(&host, &token, &owner, &repo, &sha).await
}

#[tauri::command]
async fn github_list_user_repos(login: String) -> Result<Vec<github::api::GitHubRepo>, String> {
    let host = github::auth::get_host()?;
    let token = github::auth::get_token(&login)?;
    github::api::list_user_repos(&host, &token).await
}

#[tauri::command]
async fn github_create_repo(
    login: String,
    name: String,
    description: Option<String>,
    private: bool,
) -> Result<github::api::GitHubRepo, String> {
    let host = github::auth::get_host()?;
    let token = github::auth::get_token(&login)?;
    github::api::create_repo(&host, &token, &name, description.as_deref(), private).await
}

#[tauri::command]
async fn read_pr_template(repo_path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        for candidate in [
            ".github/PULL_REQUEST_TEMPLATE.md",
            ".github/pull_request_template.md",
            "PULL_REQUEST_TEMPLATE.md",
        ] {
            if let Ok(contents) =
                std::fs::read_to_string(std::path::Path::new(&repo_path).join(candidate))
            {
                return Some(contents);
            }
        }
        None
    })
    .await
    .unwrap_or(None)
}

#[tauri::command]
async fn github_merge_pull_request(
    repo_path: String,
    login: String,
    number: u64,
    merge_method: String,
    commit_title: Option<String>,
    commit_message: Option<String>,
    sha: Option<String>,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::merge_pull_request(
        &host,
        &token,
        &owner,
        &repo,
        number,
        &login,
        &merge_method,
        commit_title.as_deref(),
        commit_message.as_deref(),
        sha.as_deref(),
    )
    .await?;

    // Write the now-merged state through to the cache immediately rather than waiting for the
    // next full list refetch: neither this mutation nor create_pull_request invalidates
    // queryKeys.prDetail/checkRuns on the frontend, only the pr-list prefix.
    if let Ok(pr) = github::api::get_pull_request(&host, &token, &owner, &repo, number).await {
        if let Ok(key) = cache_key(&repo_path) {
            cache_write(move || pr_cache::upsert_pr(&key, &pr)).await;
        }
    }
    Ok(())
}

#[tauri::command]
async fn github_delete_remote_branch(
    repo_path: String,
    login: String,
    branch: String,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::delete_branch(&host, &token, &owner, &repo, &branch).await
}

#[tauri::command]
async fn github_find_user_avatar_by_email(
    repo_path: String,
    login: String,
    email: String,
) -> Result<Option<String>, String> {
    let (host, token, _owner, _repo) = github_resolve(&repo_path, &login)?;
    github::api::find_user_avatar_by_email(&host, &token, &email).await
}

#[tauri::command]
async fn github_get_repo_merge_settings(
    repo_path: String,
    login: String,
    base_ref: String,
) -> Result<github::api::RepoMergeSettings, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::get_repo_merge_settings(&host, &token, &owner, &repo, &base_ref).await
}

#[tauri::command]
async fn github_branch_protection_requirements(
    repo_path: String,
    login: String,
    branch: String,
) -> Result<github::api::BranchProtectionRequirements, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    Ok(github::api::branch_protection_requirements(&host, &token, &owner, &repo, &branch).await)
}

#[tauri::command]
async fn github_list_pull_request_files(
    repo_path: String,
    login: String,
    number: u64,
    head_sha: String,
) -> Result<Vec<(String, String, diff::FileDiff)>, String> {
    if let Ok(key) = cache_key(&repo_path) {
        let (lookup_key, sha) = (key.clone(), head_sha.clone());
        if let Ok(Some(cached)) = tauri::async_runtime::spawn_blocking(move || {
            pr_cache::get_cached_files(&lookup_key, number, &sha)
        })
        .await
        .unwrap_or(Ok(None))
        {
            return Ok(cached);
        }
    }

    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    let files = github::api::list_pull_request_files(&host, &token, &owner, &repo, number).await?;
    if let Ok(key) = cache_key(&repo_path) {
        let (sha, to_cache) = (head_sha.clone(), files.clone());
        cache_write(move || pr_cache::upsert_files(&key, number, &sha, &to_cache)).await;
    }
    Ok(files)
}

#[tauri::command]
async fn github_get_pull_request_image_diff(
    repo_path: String,
    login: String,
    path: String,
    base_sha: String,
    head_sha: String,
) -> Result<image_diff::ImageDiff, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::get_pull_request_image_diff(
        &host, &token, &owner, &repo, &path, &base_sha, &head_sha,
    )
    .await
}

#[tauri::command]
async fn github_list_review_comments(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<Vec<github::api::ReviewComment>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    let comments = github::api::list_review_comments(&host, &token, &owner, &repo, number).await?;
    if let Ok(key) = cache_key(&repo_path) {
        let to_cache = comments.clone();
        cache_write(move || pr_cache::upsert_comments(&key, number, &to_cache)).await;
    }
    Ok(comments)
}

#[tauri::command]
async fn get_cached_pull_request_detail(
    repo_path: String,
    number: u64,
) -> Option<(
    Vec<(String, String, diff::FileDiff)>,
    Vec<github::api::ReviewComment>,
)> {
    let key = cache_key(&repo_path).ok()?;
    tauri::async_runtime::spawn_blocking(move || {
        let files = pr_cache::get_any_cached_files(&key, number).ok().flatten();
        let comments = pr_cache::get_cached_comments(&key, number).ok().flatten();
        match (files, comments) {
            (None, None) => None,
            (files, comments) => Some((files.unwrap_or_default(), comments.unwrap_or_default())),
        }
    })
    .await
    .unwrap_or(None)
}

/// Size on disk of the local GitHub PR data mirror (pr_cache.sqlite), split into `(repo_bytes,
/// avatar_bytes)` for the "Cached repo data" and "Cached user avatars" rows in Settings >
/// General > Local data.
#[tauri::command]
async fn get_cache_sizes() -> (u64, u64) {
    tauri::async_runtime::spawn_blocking(pr_cache::cache_sizes)
        .await
        .unwrap_or(Ok((0, 0)))
        .unwrap_or((0, 0))
}

/// Directory the local GitHub PR data mirror lives in, for the "Open" button in Settings >
/// General > Local data that reveals it in the OS file manager (frontend does the actual
/// revealing via `@tauri-apps/plugin-opener`'s `revealItemInDir`, same as "Reveal in Finder"
/// elsewhere). Shared by both the repo-data and avatar caches — they live in the same file.
#[tauri::command]
async fn get_cache_dir_path() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(pr_cache::dir_path)
        .await
        .map_err(|e| e.to_string())?
}

/// Empties the repo-scoped part of the local GitHub PR data mirror (PR lists/files/comments,
/// check runs — not avatars), for the "Cached repo data" > "Clear" button in Settings > General.
#[tauri::command]
async fn clear_repo_cache() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(pr_cache::clear_repo_data)
        .await
        .map_err(|e| e.to_string())?
}

/// Empties the avatar cache, for the "Cached user avatars" row's "Clear" button in Settings >
/// General. Kept separate from `clear_repo_cache` since avatars are kept indefinitely and only
/// ever removed by this explicit action (see `pr_cache::clear_avatars`).
#[tauri::command]
async fn clear_avatar_cache() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(pr_cache::clear_avatars)
        .await
        .map_err(|e| e.to_string())?
}

/// Purely local — no GitHub call, no `github_resolve`, since "archived" is a gitbud-only concept
/// (see `pr_cache::is_pr_archived`'s doc comment).
#[tauri::command]
async fn get_pr_archived(repo_path: String, number: u64) -> Result<bool, String> {
    let key = cache_key(&repo_path)?;
    tauri::async_runtime::spawn_blocking(move || pr_cache::is_pr_archived(&key, number))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_pr_archived(repo_path: String, number: u64, archived: bool) -> Result<(), String> {
    let key = cache_key(&repo_path)?;
    tauri::async_runtime::spawn_blocking(move || pr_cache::set_pr_archived(&key, number, archived))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn github_reply_to_review_comment(
    repo_path: String,
    login: String,
    number: u64,
    in_reply_to: u64,
    body: String,
) -> Result<github::api::ReviewComment, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::reply_to_review_comment(&host, &token, &owner, &repo, number, in_reply_to, &body)
        .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn github_create_review_comment(
    repo_path: String,
    login: String,
    number: u64,
    commit_id: String,
    path: String,
    line: u32,
    side: String,
    body: String,
) -> Result<github::api::ReviewComment, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::create_review_comment(
        &host, &token, &owner, &repo, number, &commit_id, &path, line, &side, &body,
    )
    .await
}

#[tauri::command]
async fn github_list_relevant_timeline_events(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<Vec<github::api::IssueTimelineEvent>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_relevant_timeline_events(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_list_issue_comments(
    repo_path: String,
    login: String,
    number: u64,
    page: u32,
) -> Result<Vec<github::api::IssueComment>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    let comments =
        github::api::list_issue_comments(&host, &token, &owner, &repo, number, page).await?;
    // Only page 1 is mirrored to the SQLite cache — see `github_list_pull_request_commits`'s
    // identical reasoning.
    if page == 1 {
        if let Ok(key) = cache_key(&repo_path) {
            let to_cache = comments.clone();
            cache_write(move || pr_cache::upsert_issue_comments(&key, number, &to_cache)).await;
        }
    }
    Ok(comments)
}

#[tauri::command]
async fn get_cached_issue_comments(
    repo_path: String,
    number: u64,
) -> Option<Vec<github::api::IssueComment>> {
    let key = cache_key(&repo_path).ok()?;
    tauri::async_runtime::spawn_blocking(move || pr_cache::get_cached_issue_comments(&key, number))
        .await
        .unwrap_or(Ok(None))
        .unwrap_or(None)
}

#[tauri::command]
async fn github_create_issue_comment(
    repo_path: String,
    login: String,
    number: u64,
    body: String,
) -> Result<github::api::IssueComment, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::create_issue_comment(&host, &token, &owner, &repo, number, &body).await
}

#[tauri::command]
async fn github_delete_issue_comment(
    repo_path: String,
    login: String,
    comment_id: u64,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::delete_issue_comment(&host, &token, &owner, &repo, comment_id).await
}

#[tauri::command]
async fn github_list_reviews(
    repo_path: String,
    login: String,
    number: u64,
    page: u32,
) -> Result<Vec<github::api::Review>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    let reviews = github::api::list_reviews(&host, &token, &owner, &repo, number, page).await?;
    // Only page 1 is mirrored to the SQLite cache — see `github_list_pull_request_commits`'s
    // identical reasoning.
    if page == 1 {
        if let Ok(key) = cache_key(&repo_path) {
            let to_cache = reviews.clone();
            cache_write(move || pr_cache::upsert_reviews(&key, number, &to_cache)).await;
        }
    }
    Ok(reviews)
}

#[tauri::command]
async fn get_cached_reviews(repo_path: String, number: u64) -> Option<Vec<github::api::Review>> {
    let key = cache_key(&repo_path).ok()?;
    tauri::async_runtime::spawn_blocking(move || pr_cache::get_cached_reviews(&key, number))
        .await
        .unwrap_or(Ok(None))
        .unwrap_or(None)
}

#[tauri::command]
async fn github_submit_review(
    repo_path: String,
    login: String,
    number: u64,
    event: String,
    body: String,
) -> Result<github::api::Review, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::submit_review(&host, &token, &owner, &repo, number, &event, &body).await
}

#[tauri::command]
async fn github_list_review_threads(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<Vec<github::api::ReviewThread>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_review_threads(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_resolve_review_thread(
    repo_path: String,
    login: String,
    thread_id: String,
) -> Result<(), String> {
    let (host, token, ..) = github_resolve(&repo_path, &login)?;
    github::api::resolve_review_thread(&host, &token, &thread_id).await
}

#[tauri::command]
async fn github_unresolve_review_thread(
    repo_path: String,
    login: String,
    thread_id: String,
) -> Result<(), String> {
    let (host, token, ..) = github_resolve(&repo_path, &login)?;
    github::api::unresolve_review_thread(&host, &token, &thread_id).await
}

#[tauri::command]
async fn github_list_viewed_files(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<Vec<(String, String)>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_viewed_files(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_mark_file_viewed(
    repo_path: String,
    login: String,
    number: u64,
    path: String,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::mark_file_as_viewed(&host, &token, &owner, &repo, number, &path).await
}

#[tauri::command]
async fn github_unmark_file_viewed(
    repo_path: String,
    login: String,
    number: u64,
    path: String,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::unmark_file_as_viewed(&host, &token, &owner, &repo, number, &path).await
}

#[tauri::command]
async fn github_list_repo_issues(
    repo_path: String,
    login: String,
) -> Result<Vec<github::api::IssueSummary>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_repo_issues(&host, &token, &owner, &repo).await
}

#[tauri::command]
async fn github_list_issue_states(
    repo_path: String,
    login: String,
    numbers: Vec<u64>,
) -> Result<std::collections::HashMap<u64, String>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_issue_states(&host, &token, &owner, &repo, &numbers).await
}

// --- github: issues (Issues tab) ---

#[tauri::command]
async fn github_list_issues(
    repo_path: String,
    login: String,
    state: String,
    page: u32,
) -> Result<Vec<github::api::Issue>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    let issues = github::api::list_issues(&host, &token, &owner, &repo, &state, page).await?;
    if let Ok(key) = cache_key(&repo_path) {
        let list = issues.clone();
        cache_write(move || pr_cache::upsert_issue_list(&key, &list)).await;
    }
    Ok(issues)
}

#[tauri::command]
async fn get_cached_issues(repo_path: String, state: String) -> Vec<github::api::Issue> {
    let Ok(key) = cache_key(&repo_path) else {
        return Vec::new();
    };
    tauri::async_runtime::spawn_blocking(move || pr_cache::get_cached_issue_list(&key, &state))
        .await
        .unwrap_or(Ok(Vec::new()))
        .unwrap_or_default()
}

#[tauri::command]
async fn github_get_issue(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<github::api::Issue, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::get_issue(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_create_issue(
    repo_path: String,
    login: String,
    title: String,
    body: String,
    labels: Vec<String>,
    assignees: Vec<String>,
    milestone: Option<u64>,
) -> Result<github::api::Issue, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    let issue = github::api::create_issue(&host, &token, &owner, &repo, &title, &body).await?;
    if !labels.is_empty() {
        github::api::add_labels(&host, &token, &owner, &repo, issue.number, &labels).await?;
    }
    if !assignees.is_empty() {
        github::api::add_assignees(&host, &token, &owner, &repo, issue.number, &assignees).await?;
    }
    if let Some(m) = milestone {
        github::api::set_milestone(&host, &token, &owner, &repo, issue.number, m).await?;
    }
    // Re-fetch so the returned issue reflects labels/assignees/milestone just attached, mirroring
    // `github_create_pull_request`'s callers re-fetching a single PR after related follow-up calls.
    github::api::get_issue(&host, &token, &owner, &repo, issue.number).await
}

#[tauri::command]
async fn github_upload_attachment(
    repo_path: String,
    login: String,
    filename: String,
    content_type: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::upload_attachment(&host, &token, &owner, &repo, &filename, &content_type, data)
        .await
}

#[tauri::command]
async fn github_update_issue_title(
    repo_path: String,
    login: String,
    number: u64,
    title: String,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::update_issue_title(&host, &token, &owner, &repo, number, &title).await
}

#[tauri::command]
async fn github_update_issue_body(
    repo_path: String,
    login: String,
    number: u64,
    body: String,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::update_issue_body(&host, &token, &owner, &repo, number, &body).await
}

/// Writes an issue's freshly-changed state through to the cache immediately rather than waiting
/// for the next full list refetch — mirrors `github_merge_pull_request`'s equivalent write-through.
async fn cache_write_issue(
    repo_path: &str,
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) {
    if let Ok(issue) = github::api::get_issue(host, token, owner, repo, number).await {
        if let Ok(key) = cache_key(repo_path) {
            cache_write(move || pr_cache::upsert_issue(&key, &issue)).await;
        }
    }
}

#[tauri::command]
async fn github_close_issue(
    repo_path: String,
    login: String,
    number: u64,
    state_reason: Option<String>,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::close_issue(
        &host,
        &token,
        &owner,
        &repo,
        number,
        state_reason.as_deref(),
    )
    .await?;
    cache_write_issue(&repo_path, &host, &token, &owner, &repo, number).await;
    Ok(())
}

#[tauri::command]
async fn github_reopen_issue(repo_path: String, login: String, number: u64) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::reopen_issue(&host, &token, &owner, &repo, number).await?;
    cache_write_issue(&repo_path, &host, &token, &owner, &repo, number).await;
    Ok(())
}

#[tauri::command]
async fn github_add_issue_to_project(
    repo_path: String,
    login: String,
    number: u64,
    project_id: String,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::add_issue_to_project(&host, &token, &owner, &repo, number, &project_id).await
}

#[tauri::command]
async fn github_get_issue_relationships(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<github::api::IssueRelationships, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::get_issue_relationships(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_add_sub_issue(
    repo_path: String,
    login: String,
    parent_number: u64,
    child_number: u64,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::add_sub_issue(&host, &token, &owner, &repo, parent_number, child_number).await
}

#[tauri::command]
async fn github_remove_sub_issue(
    repo_path: String,
    login: String,
    parent_number: u64,
    child_number: u64,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::remove_sub_issue(&host, &token, &owner, &repo, parent_number, child_number).await
}

#[tauri::command]
async fn github_add_blocked_by(
    repo_path: String,
    login: String,
    number: u64,
    blocking_number: u64,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::add_blocked_by(&host, &token, &owner, &repo, number, blocking_number).await
}

#[tauri::command]
async fn github_remove_blocked_by(
    repo_path: String,
    login: String,
    number: u64,
    blocking_number: u64,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::remove_blocked_by(&host, &token, &owner, &repo, number, blocking_number).await
}

#[tauri::command]
async fn github_create_linked_branch(
    repo_path: String,
    login: String,
    number: u64,
    base_branch: String,
    name: String,
) -> Result<github::api::LinkedBranch, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::create_linked_branch(&host, &token, &owner, &repo, number, &base_branch, &name)
        .await
}

#[tauri::command]
async fn github_delete_linked_branch(
    login: String,
    linked_branch_id: String,
) -> Result<(), String> {
    let host = github::auth::get_host()?;
    let token = github::auth::get_token(&login)?;
    github::api::delete_linked_branch(&host, &token, &linked_branch_id).await
}

/// Whether `path` currently exists on disk — used to hide filesystem-dependent context menu
/// actions (Reveal in Finder, Open in Editor) for a file from an old commit, PR, or stash that's
/// since been renamed or deleted, rather than let the user hit a dead action.
#[tauri::command]
async fn path_exists(path: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || std::path::Path::new(&path).exists())
        .await
        .unwrap_or(false)
}

#[tauri::command]
async fn open_in_terminal(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || system::open_in_terminal(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_in_editor(
    path: String,
    editor: String,
    custom_app_path: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        system::open_in_editor(&path, &editor, custom_app_path.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_app_icon(app_path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || system::get_app_icon(&app_path))
        .await
        .ok()?
}

#[tauri::command]
async fn get_repo_icon(repo_path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || repo_icon::get_repo_icon(&repo_path))
        .await
        .ok()?
}

// --- settings ---

#[tauri::command]
async fn get_settings() -> Result<settings::Settings, String> {
    tauri::async_runtime::spawn_blocking(settings::get_settings)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_settings(settings: settings::Settings) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || settings::save_settings(&settings))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_settings(dest_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || settings::export_settings(&dest_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn import_settings(src_path: String) -> Result<settings::Settings, String> {
    tauri::async_runtime::spawn_blocking(move || settings::import_settings(&src_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_git_identity(repo_path: String) -> Result<(Option<String>, Option<String>), String> {
    tauri::async_runtime::spawn_blocking(move || settings::get_git_identity(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_git_identity(
    repo_path: String,
    name: String,
    email: String,
    global: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        settings::set_git_identity(&repo_path, &name, &email, global)
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- filesystem watch ---

#[tauri::command]
async fn start_watch(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !settings::get_settings()
            .map(|s| s.fs_watch_enabled)
            .unwrap_or(true)
        {
            return Ok(());
        }
        let state = app.state::<AppState>();
        let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
        if watchers.contains_key(&repo_path) {
            return Ok(());
        }
        let watcher = watch::start_watching(app.clone(), repo_path.clone())?;
        watchers.insert(repo_path, watcher);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stop_watch(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
        watchers.remove(&repo_path);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

                let app_handle = _app.handle();
                let app_submenu = Submenu::with_items(
                    app_handle,
                    "GitBud",
                    true,
                    &[
                        &PredefinedMenuItem::about(app_handle, None, None)?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &MenuItem::with_id(
                            app_handle,
                            "settings",
                            "Settings...",
                            true,
                            Some("CmdOrCtrl+,"),
                        )?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &PredefinedMenuItem::services(app_handle, None)?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &PredefinedMenuItem::hide(app_handle, None)?,
                        &PredefinedMenuItem::hide_others(app_handle, None)?,
                        &PredefinedMenuItem::show_all(app_handle, None)?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &PredefinedMenuItem::quit(app_handle, None)?,
                    ],
                )?;

                let file_submenu = Submenu::with_items(
                    app_handle,
                    "File",
                    true,
                    &[
                        &MenuItem::with_id(
                            app_handle,
                            "add_repo",
                            "Add Repository...",
                            true,
                            Some("CmdOrCtrl+O"),
                        )?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &MenuItem::with_id(
                            app_handle,
                            "close_window",
                            "Close Window",
                            true,
                            Some("CmdOrCtrl+W"),
                        )?,
                    ],
                )?;

                let edit_submenu = Submenu::with_items(
                    app_handle,
                    "Edit",
                    true,
                    &[
                        &PredefinedMenuItem::undo(app_handle, None)?,
                        &PredefinedMenuItem::redo(app_handle, None)?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &PredefinedMenuItem::cut(app_handle, None)?,
                        &PredefinedMenuItem::copy(app_handle, None)?,
                        &PredefinedMenuItem::paste(app_handle, None)?,
                        &PredefinedMenuItem::select_all(app_handle, None)?,
                    ],
                )?;

                let repo_submenu = Submenu::with_items(
                    app_handle,
                    "Repository",
                    true,
                    &[
                        &MenuItem::with_id(
                            app_handle,
                            "fetch",
                            "Fetch",
                            true,
                            Some("CmdOrCtrl+Shift+F"),
                        )?,
                        &MenuItem::with_id(
                            app_handle,
                            "pull",
                            "Pull",
                            true,
                            Some("CmdOrCtrl+Shift+Down"),
                        )?,
                        &MenuItem::with_id(
                            app_handle,
                            "push",
                            "Push",
                            true,
                            Some("CmdOrCtrl+Shift+Up"),
                        )?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &MenuItem::with_id(
                            app_handle,
                            "branch_switcher",
                            "Switch Branch...",
                            true,
                            Some("CmdOrCtrl+B"),
                        )?,
                        &MenuItem::with_id(
                            app_handle,
                            "create_pr",
                            "Preview / Create PR...",
                            true,
                            Some("CmdOrCtrl+P"),
                        )?,
                    ],
                )?;

                let window_submenu = Submenu::with_items(
                    app_handle,
                    "Window",
                    true,
                    &[
                        &PredefinedMenuItem::minimize(app_handle, None)?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &PredefinedMenuItem::fullscreen(app_handle, None)?,
                    ],
                )?;

                let menu = Menu::with_items(
                    app_handle,
                    &[
                        &app_submenu,
                        &file_submenu,
                        &edit_submenu,
                        &repo_submenu,
                        &window_submenu,
                    ],
                )?;

                _app.set_menu(menu)?;

                _app.on_menu_event(move |app_handle, event| {
                    use tauri::Emitter;
                    match event.id.as_ref() {
                        "settings" | "add_repo" | "fetch" | "pull" | "push" | "branch_switcher"
                        | "create_pr" => {
                            let _ = app_handle.emit("menu-event", event.id.as_ref());
                        }
                        "close_window" => {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.close();
                            }
                        }
                        _ => {}
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            is_dirty,
            get_current_branch,
            list_branches,
            checkout_branch,
            create_branch,
            create_branch_at,
            stage_paths,
            unstage_paths,
            discard_file,
            discard_files,
            add_to_gitignore,
            ignore_folder,
            ignore_extension,
            resolve_conflict,
            read_working_file,
            stage_hunk,
            stage_hunk_lines,
            unstage_hunk,
            unstage_hunk_lines,
            discard_hunk,
            discard_hunk_lines,
            commit,
            create_fixup_commit,
            amend_commit,
            undo_last_commit,
            cherry_pick,
            revert_commit,
            delete_branch,
            delete_branch_remote,
            is_branch_merged,
            rename_branch,
            rename_branch_remote,
            merge_branch,
            list_stashes,
            stash_save,
            stash_apply,
            stash_pop,
            stash_drop,
            get_stash_oid,
            stash_apply_file,
            get_file_diff,
            get_commit_files,
            get_commit_file_diff,
            get_branch_diff_files,
            get_branch_diff_file,
            get_branch_image_diff,
            get_image_diff,
            get_commit_image_diff,
            get_log,
            get_commit_detail,
            get_branch_commits,
            search_commits,
            list_tags,
            create_tag,
            delete_tag,
            push_tag,
            blame_file,
            interactive_rebase,
            list_submodules,
            update_submodule,
            update_all_submodules,
            load_repos,
            add_repo,
            remove_repo,
            move_repo_to_trash,
            add_repo_section,
            remove_repo_section,
            remove_section,
            rename_section,
            set_repo_identity,
            set_repo_order,
            list_workspaces,
            create_workspace,
            update_workspace,
            delete_workspace,
            list_worktrees,
            add_worktree,
            remove_worktree,
            get_reflog,
            reflog_restore,
            has_lfs,
            check_lfs_files,
            git_lfs_pull,
            git_lfs_push,
            get_conflict_sides,
            resolve_conflict_with_content,
            has_gpg,
            install_gpg_via_brew,
            list_gpg_keys,
            generate_gpg_key,
            generate_ssh_signing_key,
            read_ssh_public_key,
            configure_signing,
            disable_signing,
            get_signing_status,
            export_gpg_public_key,
            test_signing,
            github_has_ssh_signing_key,
            github_has_gpg_key,
            list_ssh_identities,
            add_ssh_identity,
            remove_ssh_identity,
            apply_ssh_identity_to_repo,
            clear_ssh_identity_from_repo,
            init_repo,
            write_text_file,
            get_global_git_identity,
            git_fetch,
            git_pull,
            git_pull_with_strategy,
            git_abort_pull,
            git_push,
            git_publish,
            cancel_git_operation,
            git_clone,
            get_ahead_behind,
            has_upstream_remote,
            has_origin_remote,
            remote_web_info,
            get_upstream_ahead_behind,
            sync_upstream,
            checkout_pull_request,
            path_exists,
            open_in_terminal,
            open_in_editor,
            get_app_icon,
            get_repo_icon,
            get_settings,
            save_settings,
            export_settings,
            import_settings,
            get_git_identity,
            set_git_identity,
            start_watch,
            stop_watch,
            github_get_client_id,
            github_set_client_id,
            github_get_host,
            github_set_host,
            github_list_accounts,
            github_remove_account,
            github_has_token,
            github_detect_gh_cli,
            github_start_device_flow,
            github_poll_device_flow,
            github_remote_owner_repo,
            github_list_pull_requests,
            get_cached_pull_requests,
            github_get_pull_request,
            github_create_pull_request,
            github_update_pull_request_base,
            github_update_pull_request_body,
            github_update_pull_request_branch,
            github_close_pull_request,
            github_reopen_pull_request,
            github_lock_conversation,
            github_unlock_conversation,
            github_compare_pull_request_base,
            github_branch_protection_requirements,
            github_list_pull_request_commits,
            get_cached_pull_request_commits,
            github_get_commit_diff_files,
            github_list_relevant_timeline_events,
            github_list_issue_comments,
            get_cached_issue_comments,
            github_create_issue_comment,
            github_delete_issue_comment,
            github_list_reviews,
            get_cached_reviews,
            github_submit_review,
            github_list_review_threads,
            github_resolve_review_thread,
            github_unresolve_review_thread,
            github_list_viewed_files,
            github_mark_file_viewed,
            github_unmark_file_viewed,
            github_list_repo_issues,
            github_list_issue_states,
            github_list_issues,
            get_cached_issues,
            github_get_issue,
            github_create_issue,
            github_upload_attachment,
            github_update_issue_title,
            github_update_issue_body,
            github_close_issue,
            github_reopen_issue,
            github_add_issue_to_project,
            github_get_issue_relationships,
            github_add_sub_issue,
            github_remove_sub_issue,
            github_add_blocked_by,
            github_remove_blocked_by,
            github_create_linked_branch,
            github_delete_linked_branch,
            github_list_labels,
            github_list_assignable_users,
            github_add_labels,
            github_remove_label,
            github_add_assignees,
            github_remove_assignees,
            github_request_reviewers,
            github_remove_requested_reviewers,
            github_list_repo_teams,
            github_list_milestones,
            github_set_milestone,
            github_clear_milestone,
            github_list_projects,
            github_add_pull_request_to_project,
            github_merge_pull_request,
            github_delete_remote_branch,
            github_get_repo_merge_settings,
            github_find_user_avatar_by_email,
            github_list_pull_request_files,
            get_cached_pull_request_detail,
            get_cache_sizes,
            get_cache_dir_path,
            clear_repo_cache,
            clear_avatar_cache,
            get_pr_archived,
            set_pr_archived,
            github_get_pull_request_image_diff,
            github_list_review_comments,
            github_create_review_comment,
            github_reply_to_review_comment,
            github_list_check_runs,
            get_cached_check_runs,
            cache_avatar,
            get_cached_avatar,
            github_get_commit_verification,
            github_list_user_repos,
            github_create_repo,
            read_pr_template,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
