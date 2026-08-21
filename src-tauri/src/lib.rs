mod config;
mod diff;
mod git_shell;
mod github;
mod history;
mod image_diff;
mod repo;
mod stash;
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
fn is_dirty(repo_path: String) -> Result<bool, String> {
    repo::is_dirty(&repo_path)
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

#[tauri::command]
fn get_image_diff(repo_path: String, path: String, staged: bool) -> Result<image_diff::ImageDiff, String> {
    image_diff::get_image_diff(&repo_path, &path, staged)
}

#[tauri::command]
fn get_commit_image_diff(repo_path: String, oid: String, path: String) -> Result<image_diff::ImageDiff, String> {
    image_diff::get_commit_image_diff(&repo_path, &oid, &path)
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

// --- stash ---

#[tauri::command]
fn list_stashes(repo_path: String) -> Result<Vec<stash::StashEntry>, String> {
    stash::list_stashes(&repo_path)
}

#[tauri::command]
fn stash_save(repo_path: String, message: String, include_untracked: bool) -> Result<(), String> {
    stash::stash_save(&repo_path, &message, include_untracked)
}

#[tauri::command]
fn stash_apply(repo_path: String, index: usize) -> Result<(), String> {
    stash::stash_apply(&repo_path, index)
}

#[tauri::command]
fn stash_pop(repo_path: String, index: usize) -> Result<(), String> {
    stash::stash_pop(&repo_path, index)
}

#[tauri::command]
fn stash_drop(repo_path: String, index: usize) -> Result<(), String> {
    stash::stash_drop(&repo_path, index)
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

// --- github: auth ---

#[tauri::command]
fn github_get_client_id() -> Result<Option<String>, String> {
    github::auth::get_client_id()
}

#[tauri::command]
fn github_set_client_id(client_id: String) -> Result<(), String> {
    github::auth::set_client_id(&client_id)
}

#[tauri::command]
fn github_list_accounts() -> Result<Vec<github::auth::Account>, String> {
    github::auth::list_accounts()
}

#[tauri::command]
fn github_remove_account(login: String) -> Result<Vec<github::auth::Account>, String> {
    github::auth::remove_account(&login)
}

#[tauri::command]
async fn github_start_device_flow(client_id: String) -> Result<github::auth::DeviceCodeResponse, String> {
    github::auth::start_device_flow(&client_id).await
}

#[tauri::command]
async fn github_poll_device_flow(
    client_id: String,
    device_code: String,
) -> Result<github::auth::PollResult, String> {
    github::auth::poll_device_flow(&client_id, &device_code).await
}

// --- github: pull requests ---

fn github_resolve(repo_path: &str, login: &str) -> Result<(String, String, String), String> {
    let token = github::auth::get_token(login)?;
    let (owner, repo) = config::remote_owner_repo(repo_path)
        .ok_or("repository has no GitHub-style origin remote")?;
    Ok((token, owner, repo))
}

#[tauri::command]
fn github_remote_owner_repo(repo_path: String) -> Option<(String, String)> {
    config::remote_owner_repo(&repo_path)
}

#[tauri::command]
async fn github_list_pull_requests(
    repo_path: String,
    login: String,
) -> Result<Vec<github::api::PullRequest>, String> {
    let (token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_pull_requests(&token, &owner, &repo).await
}

#[tauri::command]
async fn github_get_pull_request(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<github::api::PullRequest, String> {
    let (token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::get_pull_request(&token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_create_pull_request(
    repo_path: String,
    login: String,
    title: String,
    head: String,
    base: String,
    body: String,
) -> Result<github::api::PullRequest, String> {
    let (token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::create_pull_request(&token, &owner, &repo, &title, &head, &base, &body).await
}

#[tauri::command]
async fn github_merge_pull_request(
    repo_path: String,
    login: String,
    number: u64,
    merge_method: String,
) -> Result<(), String> {
    let (token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::merge_pull_request(&token, &owner, &repo, number, &merge_method).await
}

#[tauri::command]
async fn github_list_pull_request_files(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<Vec<(String, String, diff::FileDiff)>, String> {
    let (token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_pull_request_files(&token, &owner, &repo, number).await
}

#[tauri::command]
async fn github_list_review_comments(
    repo_path: String,
    login: String,
    number: u64,
) -> Result<Vec<github::api::ReviewComment>, String> {
    let (token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_review_comments(&token, &owner, &repo, number).await
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
    let (token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::create_review_comment(
        &token, &owner, &repo, number, &commit_id, &path, line, &side, &body,
    )
    .await
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_status,
            is_dirty,
            get_current_branch,
            list_branches,
            checkout_branch,
            create_branch,
            stage_paths,
            unstage_paths,
            commit,
            list_stashes,
            stash_save,
            stash_apply,
            stash_pop,
            stash_drop,
            get_file_diff,
            get_commit_files,
            get_commit_file_diff,
            get_image_diff,
            get_commit_image_diff,
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
            github_get_client_id,
            github_set_client_id,
            github_list_accounts,
            github_remove_account,
            github_start_device_flow,
            github_poll_device_flow,
            github_remote_owner_repo,
            github_list_pull_requests,
            github_get_pull_request,
            github_create_pull_request,
            github_merge_pull_request,
            github_list_pull_request_files,
            github_list_review_comments,
            github_create_review_comment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
