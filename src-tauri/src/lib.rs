mod config;
mod diff;
mod git_shell;
mod history;
mod repo;
mod watch;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Default)]
pub struct AppState {
    watchers: Mutex<HashMap<String, notify::RecommendedWatcher>>,
}

// --- repo status / branches / staging / commit ---

#[tauri::command]
fn get_status(repo_path: String) -> Result<repo::RepoStatus, String> {
    repo::get_status(&repo_path)
}

#[tauri::command]
fn get_current_branch(repo_path: String) -> Result<String, String> {
    repo::get_current_branch(&repo_path)
}

#[tauri::command]
fn list_branches(repo_path: String) -> Result<Vec<repo::BranchInfo>, String> {
    repo::list_branches(&repo_path)
}

#[tauri::command]
fn checkout_branch(repo_path: String, branch: String) -> Result<(), String> {
    repo::checkout_branch(&repo_path, &branch)
}

#[tauri::command]
fn create_branch(repo_path: String, name: String, checkout: bool) -> Result<(), String> {
    repo::create_branch(&repo_path, &name, checkout)
}

#[tauri::command]
fn stage_paths(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    repo::stage_paths(&repo_path, &paths)
}

#[tauri::command]
fn unstage_paths(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    repo::unstage_paths(&repo_path, &paths)
}

#[tauri::command]
fn commit(repo_path: String, summary: String, description: String) -> Result<String, String> {
    repo::commit(&repo_path, &summary, &description)
}

// --- diffs ---

#[tauri::command]
fn get_file_diff(repo_path: String, path: String, staged: bool) -> Result<diff::FileDiff, String> {
    diff::get_file_diff(&repo_path, &path, staged)
}

#[tauri::command]
fn get_commit_files(repo_path: String, oid: String) -> Result<Vec<(String, String)>, String> {
    diff::get_commit_files(&repo_path, &oid)
}

#[tauri::command]
fn get_commit_file_diff(repo_path: String, oid: String, path: String) -> Result<diff::FileDiff, String> {
    diff::get_commit_file_diff(&repo_path, &oid, &path)
}

// --- history ---

#[tauri::command]
fn get_log(repo_path: String, limit: usize, skip: usize) -> Result<Vec<history::CommitEntry>, String> {
    history::get_log(&repo_path, limit, skip)
}

// --- repo list config ---

#[tauri::command]
fn load_repos() -> Result<Vec<config::RepoEntry>, String> {
    config::load_repos()
}

#[tauri::command]
fn add_repo(path: String) -> Result<Vec<config::RepoEntry>, String> {
    config::add_repo(&path)
}

#[tauri::command]
fn remove_repo(path: String) -> Result<Vec<config::RepoEntry>, String> {
    config::remove_repo(&path)
}

#[tauri::command]
fn set_repo_private(path: String, is_private: bool) -> Result<Vec<config::RepoEntry>, String> {
    config::set_repo_private(&path, is_private)
}

#[tauri::command]
fn init_repo(path: String) -> Result<(), String> {
    git2::Repository::init(&path).map_err(|e| e.message().to_string())?;
    Ok(())
}

// --- sync: fetch/pull/push/clone via system git ---

#[tauri::command]
fn git_fetch(app: AppHandle, repo_path: String) -> Result<(), String> {
    git_shell::fetch(&app, &repo_path, &repo_path)?;
    let now = chrono::Utc::now().timestamp();
    config::touch_last_fetched(&repo_path, now)?;
    Ok(())
}

#[tauri::command]
fn git_pull(app: AppHandle, repo_path: String) -> Result<(), String> {
    git_shell::pull(&app, &repo_path, &repo_path)
}

#[tauri::command]
fn git_push(app: AppHandle, repo_path: String) -> Result<(), String> {
    git_shell::push(&app, &repo_path, &repo_path)
}

#[tauri::command]
fn git_clone(app: AppHandle, url: String, dest: String) -> Result<(), String> {
    git_shell::clone(&app, &url, &dest, &dest)
}

#[tauri::command]
fn get_ahead_behind(repo_path: String) -> Result<git_shell::AheadBehind, String> {
    git_shell::get_ahead_behind(&repo_path)
}

// --- filesystem watch ---

#[tauri::command]
fn start_watch(app: AppHandle, state: State<AppState>, repo_path: String) -> Result<(), String> {
    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    if watchers.contains_key(&repo_path) {
        return Ok(());
    }
    let watcher = watch::start_watching(app, repo_path.clone())?;
    watchers.insert(repo_path, watcher);
    Ok(())
}

#[tauri::command]
fn stop_watch(state: State<AppState>, repo_path: String) -> Result<(), String> {
    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    watchers.remove(&repo_path);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_current_branch,
            list_branches,
            checkout_branch,
            create_branch,
            stage_paths,
            unstage_paths,
            commit,
            get_file_diff,
            get_commit_files,
            get_commit_file_diff,
            get_log,
            load_repos,
            add_repo,
            remove_repo,
            set_repo_private,
            init_repo,
            git_fetch,
            git_pull,
            git_push,
            git_clone,
            get_ahead_behind,
            start_watch,
            stop_watch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
