mod blame;
mod config;
mod diff;
mod git_shell;
mod github;
mod history;
mod hunk;
mod image_diff;
mod rebase;
mod repo;
mod settings;
mod stash;
mod submodules;
mod system;
mod tags;
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
fn create_branch_at(repo_path: String, name: String, oid: String, checkout: bool) -> Result<(), String> {
    repo::create_branch_at(&repo_path, &name, &oid, checkout)
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
fn discard_file(repo_path: String, path: String) -> Result<(), String> {
    repo::discard_file(&repo_path, &path)
}

#[tauri::command]
fn resolve_conflict(repo_path: String, path: String, side: String) -> Result<(), String> {
    repo::resolve_conflict(&repo_path, &path, &side)
}

#[tauri::command]
fn read_working_file(repo_path: String, path: String) -> Result<String, String> {
    std::fs::read_to_string(std::path::Path::new(&repo_path).join(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn stage_hunk(repo_path: String, path: String, hunk_index: usize) -> Result<(), String> {
    hunk::stage_hunk(&repo_path, &path, hunk_index)
}

#[tauri::command]
fn unstage_hunk(repo_path: String, path: String, hunk_index: usize) -> Result<(), String> {
    hunk::unstage_hunk(&repo_path, &path, hunk_index)
}

#[tauri::command]
fn discard_hunk(repo_path: String, path: String, hunk_index: usize) -> Result<(), String> {
    hunk::discard_hunk(&repo_path, &path, hunk_index)
}

#[tauri::command]
fn commit(repo_path: String, summary: String, description: String) -> Result<String, String> {
    repo::commit(&repo_path, &summary, &description)
}

#[tauri::command]
fn amend_commit(repo_path: String, summary: String, description: String) -> Result<String, String> {
    repo::amend_commit(&repo_path, &summary, &description)
}

#[tauri::command]
fn cherry_pick(repo_path: String, oid: String) -> Result<repo::CherryPickResult, String> {
    repo::cherry_pick(&repo_path, &oid)
}

#[tauri::command]
fn revert_commit(repo_path: String, oid: String) -> Result<repo::CherryPickResult, String> {
    repo::revert_commit(&repo_path, &oid)
}

#[tauri::command]
fn delete_branch(repo_path: String, name: String) -> Result<(), String> {
    repo::delete_branch(&repo_path, &name)
}

#[tauri::command]
fn rename_branch(repo_path: String, old_name: String, new_name: String) -> Result<(), String> {
    repo::rename_branch(&repo_path, &old_name, &new_name)
}

#[tauri::command]
fn merge_branch(repo_path: String, branch_name: String) -> Result<repo::CherryPickResult, String> {
    repo::merge_branch(&repo_path, &branch_name)
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

#[tauri::command]
fn search_commits(repo_path: String, query: String, limit: usize) -> Result<Vec<history::CommitSearchResult>, String> {
    history::search_commits(&repo_path, &query, limit)
}

// --- tags ---

#[tauri::command]
fn list_tags(repo_path: String) -> Result<Vec<tags::TagInfo>, String> {
    tags::list_tags(&repo_path)
}

#[tauri::command]
fn create_tag(repo_path: String, name: String, message: String) -> Result<(), String> {
    tags::create_tag(&repo_path, &name, &message)
}

#[tauri::command]
fn delete_tag(repo_path: String, name: String) -> Result<(), String> {
    tags::delete_tag(&repo_path, &name)
}

#[tauri::command]
fn push_tag(app: AppHandle, repo_path: String, name: String) -> Result<(), String> {
    git_shell::push_ref(&app, &repo_path, &name, &repo_path)
}

#[tauri::command]
fn interactive_rebase(
    repo_path: String,
    base_oid: String,
    todo: Vec<rebase::RebaseTodoItem>,
) -> Result<rebase::RebaseResult, String> {
    rebase::interactive_rebase(&repo_path, &base_oid, &todo)
}

// --- submodules ---

#[tauri::command]
fn list_submodules(repo_path: String) -> Result<Vec<submodules::SubmoduleInfo>, String> {
    submodules::list_submodules(&repo_path)
}

#[tauri::command]
fn update_submodule(app: AppHandle, repo_path: String, submodule_path: String) -> Result<(), String> {
    git_shell::update_submodule(&app, &repo_path, &submodule_path, &repo_path)
}

#[tauri::command]
fn update_all_submodules(app: AppHandle, repo_path: String) -> Result<(), String> {
    git_shell::update_all_submodules(&app, &repo_path, &repo_path)
}

// --- blame ---

#[tauri::command]
fn blame_file(repo_path: String, path: String) -> Result<Vec<blame::BlameLine>, String> {
    blame::blame_file(&repo_path, &path)
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
fn set_repo_section(path: String, section: Option<String>) -> Result<Vec<config::RepoEntry>, String> {
    config::set_repo_section(&path, section)
}

#[tauri::command]
fn init_repo(path: String) -> Result<(), String> {
    let default_branch = settings::get_settings()
        .map(|s| s.default_branch_name)
        .unwrap_or_else(|_| "main".to_string());
    let mut opts = git2::RepositoryInitOptions::new();
    opts.initial_head(&default_branch);
    git2::Repository::init_opts(&path, &opts).map_err(|e| e.message().to_string())?;
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

#[tauri::command]
fn has_upstream_remote(repo_path: String) -> bool {
    git_shell::has_remote(&repo_path, "upstream")
}

#[tauri::command]
fn get_upstream_ahead_behind(
    repo_path: String,
    branch: String,
) -> Result<Option<git_shell::AheadBehind>, String> {
    git_shell::get_upstream_ahead_behind(&repo_path, &branch)
}

#[tauri::command]
fn sync_upstream(app: AppHandle, repo_path: String, branch: String) -> Result<(), String> {
    git_shell::sync_upstream(&app, &repo_path, &branch, &repo_path)
}

#[tauri::command]
fn checkout_pull_request(app: AppHandle, repo_path: String, number: u64) -> Result<String, String> {
    git_shell::checkout_pull_request(&app, &repo_path, number, &repo_path)
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
fn github_get_host() -> Result<String, String> {
    github::auth::get_host()
}

#[tauri::command]
fn github_set_host(host: String) -> Result<(), String> {
    github::auth::set_host(&host)
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
fn github_remote_owner_repo(repo_path: String) -> Option<(String, String)> {
    config::remote_owner_repo(&repo_path)
}

#[tauri::command]
async fn github_list_pull_requests(
    repo_path: String,
    login: String,
    state: String,
) -> Result<Vec<github::api::PullRequest>, String> {
    let (host, token, owner, repo) = github_resolve(&repo_path, &login)?;
    github::api::list_pull_requests(&host, &token, &owner, &repo, &state).await
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
fn read_pr_template(repo_path: String) -> Option<String> {
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
fn open_in_terminal(path: String) -> Result<(), String> {
    system::open_in_terminal(&path)
}

// --- settings ---

#[tauri::command]
fn get_settings() -> Result<settings::Settings, String> {
    settings::get_settings()
}

#[tauri::command]
fn save_settings(settings: settings::Settings) -> Result<(), String> {
    settings::save_settings(&settings)
}

#[tauri::command]
fn get_git_identity(repo_path: String) -> Result<(Option<String>, Option<String>), String> {
    settings::get_git_identity(&repo_path)
}

#[tauri::command]
fn set_git_identity(repo_path: String, name: String, email: String, global: bool) -> Result<(), String> {
    settings::set_git_identity(&repo_path, &name, &email, global)
}

// --- filesystem watch ---

#[tauri::command]
fn start_watch(app: AppHandle, state: State<AppState>, repo_path: String) -> Result<(), String> {
    if !settings::get_settings().map(|s| s.fs_watch_enabled).unwrap_or(true) {
        return Ok(());
    }
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
            get_file_diff,
            get_commit_files,
            get_commit_file_diff,
            get_image_diff,
            get_commit_image_diff,
            get_log,
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
            set_repo_private,
            set_repo_section,
            init_repo,
            git_fetch,
            git_pull,
            git_push,
            git_clone,
            get_ahead_behind,
            has_upstream_remote,
            get_upstream_ahead_behind,
            sync_upstream,
            checkout_pull_request,
            open_in_terminal,
            get_settings,
            save_settings,
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
            github_detect_gh_cli,
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
            github_list_check_runs,
            github_get_commit_verification,
            github_list_user_repos,
            read_pr_template,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
