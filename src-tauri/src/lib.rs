mod blame;
mod config;
mod diff;
mod git_shell;
mod github;
mod history;
mod hunk;
mod image_diff;
mod lfs;
mod merge3;
mod rebase;
mod reflog;
mod repo;
mod settings;
mod signing;
mod ssh_identity;
mod stash;
mod submodules;
mod system;
mod tags;
mod watch;
mod worktrees;
mod workspaces;

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
async fn create_branch_at(repo_path: String, name: String, oid: String, checkout: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::create_branch_at(&repo_path, &name, &oid, checkout))
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
async fn resolve_conflict(repo_path: String, path: String, side: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::resolve_conflict(&repo_path, &path, &side))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_working_file(repo_path: String, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::read_to_string(std::path::Path::new(&repo_path).join(&path)).map_err(|e| e.to_string())
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
async fn unstage_hunk(repo_path: String, path: String, hunk_index: usize) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || hunk::unstage_hunk(&repo_path, &path, hunk_index))
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
async fn commit(repo_path: String, summary: String, description: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || repo::commit(&repo_path, &summary, &description))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn amend_commit(repo_path: String, summary: String, description: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || repo::amend_commit(&repo_path, &summary, &description))
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
async fn rename_branch(repo_path: String, old_name: String, new_name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || repo::rename_branch(&repo_path, &old_name, &new_name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn merge_branch(repo_path: String, branch_name: String) -> Result<repo::CherryPickResult, String> {
    tauri::async_runtime::spawn_blocking(move || repo::merge_branch(&repo_path, &branch_name))
        .await
        .map_err(|e| e.to_string())?
}

// --- diffs ---

#[tauri::command]
async fn get_file_diff(repo_path: String, path: String, staged: bool) -> Result<diff::FileDiff, String> {
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
async fn get_commit_file_diff(repo_path: String, oid: String, path: String) -> Result<diff::FileDiff, String> {
    tauri::async_runtime::spawn_blocking(move || diff::get_commit_file_diff(&repo_path, &oid, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_branch_diff_files(repo_path: String, base: String, head: String) -> Result<Vec<(String, String)>, String> {
    tauri::async_runtime::spawn_blocking(move || diff::get_branch_diff_files(&repo_path, &base, &head))
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
    tauri::async_runtime::spawn_blocking(move || diff::get_branch_diff_file(&repo_path, &base, &head, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_image_diff(repo_path: String, path: String, staged: bool) -> Result<image_diff::ImageDiff, String> {
    tauri::async_runtime::spawn_blocking(move || image_diff::get_image_diff(&repo_path, &path, staged))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_commit_image_diff(repo_path: String, oid: String, path: String) -> Result<image_diff::ImageDiff, String> {
    tauri::async_runtime::spawn_blocking(move || image_diff::get_commit_image_diff(&repo_path, &oid, &path))
        .await
        .map_err(|e| e.to_string())?
}

// --- history ---

#[tauri::command]
async fn get_log(repo_path: String, limit: usize, skip: usize) -> Result<Vec<history::CommitEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || history::get_log(&repo_path, limit, skip))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn search_commits(repo_path: String, query: String, limit: usize) -> Result<Vec<history::CommitSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || history::search_commits(&repo_path, &query, limit))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_branch_commits(repo_path: String, base: String, head: String) -> Result<Vec<history::CommitSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || history::get_branch_commits(&repo_path, &base, &head))
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
    tauri::async_runtime::spawn_blocking(move || git_shell::push_ref(&app, &repo_path, &name, &repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn interactive_rebase(
    repo_path: String,
    base_oid: String,
    todo: Vec<rebase::RebaseTodoItem>,
) -> Result<rebase::RebaseResult, String> {
    tauri::async_runtime::spawn_blocking(move || rebase::interactive_rebase(&repo_path, &base_oid, &todo))
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
async fn update_submodule(app: AppHandle, repo_path: String, submodule_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_shell::update_submodule(&app, &repo_path, &submodule_path, &repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_all_submodules(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git_shell::update_all_submodules(&app, &repo_path, &repo_path))
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

#[tauri::command]
async fn add_repo_section(path: String, section: String) -> Result<Vec<config::RepoEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || config::add_repo_section(&path, &section))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_repo_section(path: String, section: String) -> Result<Vec<config::RepoEntry>, String> {
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
async fn set_repo_identity(path: String, identity_id: Option<String>) -> Result<Vec<config::RepoEntry>, String> {
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
async fn create_workspace(name: String, repo_paths: Vec<String>) -> Result<Vec<workspaces::Workspace>, String> {
    tauri::async_runtime::spawn_blocking(move || workspaces::create(&name, repo_paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_workspace(id: String, name: String, repo_paths: Vec<String>) -> Result<Vec<workspaces::Workspace>, String> {
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
async fn add_worktree(repo_path: String, path: String, branch: String, create_branch: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || worktrees::add_worktree(&repo_path, &path, &branch, create_branch))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_worktree(repo_path: String, worktree_path: String, force: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || worktrees::remove_worktree(&repo_path, &worktree_path, force))
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
async fn check_lfs_files(repo_path: String, paths: Vec<String>) -> Result<Vec<lfs::LfsFileInfo>, String> {
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
async fn get_conflict_sides(repo_path: String, path: String) -> Result<merge3::ConflictSides, String> {
    tauri::async_runtime::spawn_blocking(move || merge3::get_conflict_sides(&repo_path, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn resolve_conflict_with_content(repo_path: String, path: String, content: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || merge3::resolve_conflict_with_content(&repo_path, &path, &content))
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
async fn configure_signing(repo_path: String, format: String, signing_key: String, global: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || signing::configure_signing(&repo_path, &format, &signing_key, global))
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

// --- git identities: GitHub accounts (see github/) plus plain SSH-key identities ---

#[tauri::command]
async fn list_ssh_identities() -> Result<Vec<ssh_identity::SshIdentity>, String> {
    tauri::async_runtime::spawn_blocking(ssh_identity::list)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_ssh_identity(label: String, host: String, key_path: String) -> Result<Vec<ssh_identity::SshIdentity>, String> {
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
async fn init_repo(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let default_branch = settings::get_settings()
            .map(|s| s.default_branch_name)
            .unwrap_or_else(|_| "main".to_string());
        let mut opts = git2::RepositoryInitOptions::new();
        opts.initial_head(&default_branch);
        git2::Repository::init_opts(&path, &opts).map_err(|e| e.message().to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- stash ---

#[tauri::command]
async fn list_stashes(repo_path: String) -> Result<Vec<stash::StashEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || stash::list_stashes(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stash_save(repo_path: String, message: String, include_untracked: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stash::stash_save(&repo_path, &message, include_untracked))
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
async fn git_push(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git_shell::push(&app, &repo_path, &repo_path))
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
async fn get_upstream_ahead_behind(
    repo_path: String,
    branch: String,
) -> Result<Option<git_shell::AheadBehind>, String> {
    tauri::async_runtime::spawn_blocking(move || git_shell::get_upstream_ahead_behind(&repo_path, &branch))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sync_upstream(app: AppHandle, repo_path: String, branch: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git_shell::sync_upstream(&app, &repo_path, &branch, &repo_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn checkout_pull_request(app: AppHandle, repo_path: String, number: u64) -> Result<String, String> {
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
async fn github_start_device_flow(client_id: String) -> Result<github::auth::DeviceCodeResponse, String> {
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

fn github_resolve(repo_path: &str, login: &str) -> Result<(String, String, String, String), String> {
    let host = github::auth::get_host()?;
    let token = github::auth::get_token(login)?;
    let (owner, repo) = config::remote_owner_repo(repo_path)
        .ok_or("repository has no GitHub-style origin remote")?;
    Ok((host, token, owner, repo))
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
    github::api::list_pull_requests(&host, &token, &owner, &repo, &state, page).await
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
    github::api::create_pull_request(&host, &token, &owner, &repo, &title, &head, &base, &body, draft).await
}

#[tauri::command]
async fn github_list_labels(repo_path: String, login: String) -> Result<Vec<github::api::Label>, String> {
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
async fn github_add_labels(repo_path: String, login: String, number: u64, labels: Vec<String>) -> Result<(), String> {
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
async fn github_request_reviewers(
    repo_path: String,
    login: String,
    number: u64,
    reviewers: Vec<String>,
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::request_reviewers(&host, &token, &owner, &repo, number, &reviewers).await
}

#[tauri::command]
async fn github_list_milestones(repo_path: String, login: String) -> Result<Vec<github::api::Milestone>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_milestones(&host, &token, &owner, &repo).await
}

#[tauri::command]
async fn github_set_milestone(repo_path: String, login: String, number: u64, milestone: u64) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::set_milestone(&host, &token, &owner, &repo, number, milestone).await
}

#[tauri::command]
async fn github_list_projects(repo_path: String, login: String) -> Result<Vec<github::api::Project>, String> {
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
    github::api::add_pull_request_to_project(&host, &token, &owner, &repo, number, &project_id).await
}

#[tauri::command]
async fn github_list_check_runs(
    repo_path: String,
    login: String,
    sha: String,
) -> Result<Vec<github::api::CheckRun>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_check_runs(&host, &token, &owner, &repo, &sha).await
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
async fn read_pr_template(repo_path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        for candidate in [
            ".github/PULL_REQUEST_TEMPLATE.md",
            ".github/pull_request_template.md",
            "PULL_REQUEST_TEMPLATE.md",
        ] {
            if let Ok(contents) = std::fs::read_to_string(std::path::Path::new(&repo_path).join(candidate)) {
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
) -> Result<(), String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::merge_pull_request(&host, &token, &owner, &repo, number, &merge_method).await
}

#[tauri::command]
async fn github_list_pull_request_files(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<Vec<(String, String, diff::FileDiff)>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_pull_request_files(&host, &token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_list_review_comments(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<Vec<github::api::ReviewComment>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_review_comments(&host, &token, &owner, &repo, number).await
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
async fn open_in_terminal(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || system::open_in_terminal(&path))
        .await
        .map_err(|e| e.to_string())?
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
async fn set_git_identity(repo_path: String, name: String, email: String, global: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || settings::set_git_identity(&repo_path, &name, &email, global))
        .await
        .map_err(|e| e.to_string())?
}

// --- filesystem watch ---

#[tauri::command]
async fn start_watch(app: AppHandle, repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !settings::get_settings().map(|s| s.fs_watch_enabled).unwrap_or(true) {
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
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

                let app_handle = app.handle();
                let app_submenu = Submenu::with_items(
                    app_handle,
                    "GitBud",
                    true,
                    &[
                        &PredefinedMenuItem::about(app_handle, None, None)?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &MenuItem::with_id(app_handle, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?,
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
                        &MenuItem::with_id(app_handle, "add_repo", "Add Repository...", true, Some("CmdOrCtrl+O"))?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &MenuItem::with_id(app_handle, "close_window", "Close Window", true, Some("CmdOrCtrl+W"))?,
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
                        &MenuItem::with_id(app_handle, "fetch", "Fetch", true, Some("CmdOrCtrl+Shift+F"))?,
                        &MenuItem::with_id(app_handle, "pull", "Pull", true, Some("CmdOrCtrl+Shift+Down"))?,
                        &MenuItem::with_id(app_handle, "push", "Push", true, Some("CmdOrCtrl+Shift+Up"))?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &MenuItem::with_id(app_handle, "branch_switcher", "Switch Branch...", true, Some("CmdOrCtrl+B"))?,
                        &MenuItem::with_id(app_handle, "create_pr", "Preview / Create PR...", true, Some("CmdOrCtrl+P"))?,
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

                app.set_menu(menu)?;

                app.on_menu_event(move |app_handle, event| {
                    use tauri::Emitter;
                    match event.id.as_ref() {
                        "settings" | "add_repo" | "fetch" | "pull" | "push" | "branch_switcher" | "create_pr" => {
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
            resolve_conflict,
            read_working_file,
            stage_hunk,
            unstage_hunk,
            discard_hunk,
            commit,
            amend_commit,
            cherry_pick,
            revert_commit,
            delete_branch,
            rename_branch,
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
            get_image_diff,
            get_commit_image_diff,
            get_log,
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
            list_gpg_keys,
            generate_gpg_key,
            generate_ssh_signing_key,
            configure_signing,
            disable_signing,
            get_signing_status,
            list_ssh_identities,
            add_ssh_identity,
            remove_ssh_identity,
            apply_ssh_identity_to_repo,
            clear_ssh_identity_from_repo,
            init_repo,
            git_fetch,
            git_pull,
            git_push,
            cancel_git_operation,
            git_clone,
            get_ahead_behind,
            has_upstream_remote,
            get_upstream_ahead_behind,
            sync_upstream,
            checkout_pull_request,
            open_in_terminal,
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
            github_get_pull_request,
            github_create_pull_request,
            github_list_labels,
            github_list_assignable_users,
            github_add_labels,
            github_add_assignees,
            github_request_reviewers,
            github_list_milestones,
            github_set_milestone,
            github_list_projects,
            github_add_pull_request_to_project,
            github_merge_pull_request,
            github_list_pull_request_files,
            github_list_review_comments,
            github_create_review_comment,
            github_list_check_runs,
            github_get_commit_verification,
            github_list_user_repos,
            read_pr_template,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
