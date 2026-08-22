use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitOutputLine {
    pub stream: String, // "stdout" | "stderr"
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AheadBehind {
    pub ahead: usize,
    pub behind: usize,
}

/// Runs a system `git` subcommand in `repo_path`, streaming each output line to the frontend
/// as a `git://<event_id>` event so long-running fetch/pull/push can show live progress.
fn run_streaming(app: &AppHandle, repo_path: &str, args: &[&str], event_id: &str) -> Result<(), String> {
    let mut child = Command::new(crate::settings::git_binary())
        .args(args)
        .current_dir(repo_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    let app_out = app.clone();
    let event_out = format!("git://{event_id}");
    let out_handle = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = app_out.emit(&event_out, GitOutputLine { stream: "stdout".into(), line });
        }
    });

    let app_err = app.clone();
    let event_err = format!("git://{event_id}");
    let err_handle = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = app_err.emit(&event_err, GitOutputLine { stream: "stderr".into(), line });
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = out_handle.join();
    let _ = err_handle.join();

    if status.success() {
        Ok(())
    } else {
        Err(format!("git {} exited with {status}", args.join(" ")))
    }
}

pub fn fetch(app: &AppHandle, repo_path: &str, event_id: &str) -> Result<(), String> {
    run_streaming(app, repo_path, &["fetch", "--prune"], event_id)
}

pub fn pull(app: &AppHandle, repo_path: &str, event_id: &str) -> Result<(), String> {
    use crate::settings::PullStrategy;
    let strategy = crate::settings::get_settings().map(|s| s.pull_strategy).unwrap_or(PullStrategy::Merge);
    let args: &[&str] = match strategy {
        PullStrategy::Merge => &["pull"],
        PullStrategy::Rebase => &["pull", "--rebase"],
        PullStrategy::FfOnly => &["pull", "--ff-only"],
    };
    run_streaming(app, repo_path, args, event_id)
}

pub fn push(app: &AppHandle, repo_path: &str, event_id: &str) -> Result<(), String> {
    run_streaming(app, repo_path, &["push"], event_id)
}

/// Pushes a single ref (e.g. a tag name) to `origin`.
pub fn push_ref(app: &AppHandle, repo_path: &str, ref_name: &str, event_id: &str) -> Result<(), String> {
    run_streaming(app, repo_path, &["push", "origin", ref_name], event_id)
}

pub fn clone(app: &AppHandle, url: &str, dest: &str, event_id: &str) -> Result<(), String> {
    let mut child = Command::new(crate::settings::git_binary())
        .args(["clone", "--progress", url, dest])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stderr = child.stderr.take().ok_or("no stderr")?;
    let app_err = app.clone();
    let event_err = format!("git://{event_id}");
    let err_handle = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = app_err.emit(&event_err, GitOutputLine { stream: "stderr".into(), line });
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = err_handle.join();

    if status.success() {
        Ok(())
    } else {
        Err(format!("git clone exited with {status}"))
    }
}

/// Fetches a PR's head ref and checks it out as a local tracking branch `pr-{number}`,
/// so testing a PR locally never touches the contributor's own branch naming.
pub fn checkout_pull_request(
    app: &AppHandle,
    repo_path: &str,
    number: u64,
    event_id: &str,
) -> Result<String, String> {
    let local_branch = format!("pr-{number}");
    let refspec = format!("pull/{number}/head:{local_branch}");
    run_streaming(app, repo_path, &["fetch", "origin", &refspec], event_id)?;
    run_streaming(app, repo_path, &["checkout", &local_branch], event_id)?;
    Ok(local_branch)
}

/// Fetches `upstream` and fast-forwards the given local branch to `upstream/{branch}`.
/// Used for fork-sync: keeping a fork's default branch caught up without a terminal.
pub fn sync_upstream(
    app: &AppHandle,
    repo_path: &str,
    branch: &str,
    event_id: &str,
) -> Result<(), String> {
    run_streaming(app, repo_path, &["fetch", "upstream"], event_id)?;
    let upstream_ref = format!("upstream/{branch}");
    run_streaming(app, repo_path, &["merge", "--ff-only", &upstream_ref], event_id)
}

pub fn has_remote(repo_path: &str, name: &str) -> bool {
    git2::Repository::open(repo_path)
        .and_then(|repo| repo.find_remote(name).map(|_| ()))
        .is_ok()
}

pub fn get_ahead_behind(repo_path: &str) -> Result<AheadBehind, String> {
    let repo = git2::Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let head = repo.head().map_err(|e| e.message().to_string())?;
    let local_oid = head.target().ok_or("HEAD has no target")?;

    let branch_name = head.shorthand().ok_or("HEAD has no shorthand")?;
    let upstream_ref = format!("refs/remotes/origin/{branch_name}");
    let upstream_oid = match repo.refname_to_id(&upstream_ref) {
        Ok(oid) => oid,
        Err(_) => return Ok(AheadBehind { ahead: 0, behind: 0 }),
    };

    let (ahead, behind) = repo
        .graph_ahead_behind(local_oid, upstream_oid)
        .map_err(|e| e.message().to_string())?;
    Ok(AheadBehind { ahead, behind })
}

/// Ahead/behind of the local branch vs. `upstream/{branch}` (the fork's origin, as opposed
/// to `origin`), used to power the "fork is behind upstream" banner. Returns None when
/// there's no `upstream` remote or no matching remote-tracking ref yet.
pub fn get_upstream_ahead_behind(repo_path: &str, branch: &str) -> Result<Option<AheadBehind>, String> {
    let repo = git2::Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    if repo.find_remote("upstream").is_err() {
        return Ok(None);
    }
    let head = repo.head().map_err(|e| e.message().to_string())?;
    let Some(local_oid) = head.target() else { return Ok(None) };

    let upstream_ref = format!("refs/remotes/upstream/{branch}");
    let Ok(upstream_oid) = repo.refname_to_id(&upstream_ref) else {
        return Ok(None);
    };

    let (ahead, behind) = repo
        .graph_ahead_behind(local_oid, upstream_oid)
        .map_err(|e| e.message().to_string())?;
    Ok(Some(AheadBehind { ahead, behind }))
}
