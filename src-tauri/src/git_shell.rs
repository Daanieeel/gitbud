use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
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
    /// Whether the current branch has an `origin` upstream at all. `false` means the branch
    /// has never been pushed (`git push` would fail without `-u`) — distinct from being merely
    /// up to date, which also reports `ahead: 0, behind: 0`.
    pub published: bool,
}

/// How long a streamed git operation can go with zero output before we assume it's stuck
/// (most commonly: waiting on an interactive credential/passphrase prompt that has nowhere
/// to be shown) and kill it. Reset on every line of output, so a slow-but-progressing push
/// or clone is never killed for taking a while.
const IDLE_TIMEOUT: Duration = Duration::from_secs(45);

struct RunningOp {
    pid: u32,
    cancelled: Arc<AtomicBool>,
}

fn registry() -> &'static Mutex<HashMap<String, RunningOp>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, RunningOp>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Cancels the running git operation registered under `event_id` (the same id passed to
/// `run_streaming`/`clone`, currently the repo path or clone destination).
pub fn cancel(event_id: &str) -> Result<(), String> {
    let reg = registry().lock().map_err(|_| "internal lock error".to_string())?;
    let op = reg.get(event_id).ok_or("No running git operation for this repo")?;
    op.cancelled.store(true, Ordering::SeqCst);
    kill_pid(op.pid);
    Ok(())
}

#[cfg(target_os = "windows")]
fn kill_pid(pid: u32) {
    let _ = Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).status();
}

#[cfg(not(target_os = "windows"))]
fn kill_pid(pid: u32) {
    let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
}

/// Reads raw bytes from `reader` (rather than `BufRead::lines()`), splitting on `\n` OR `\r`
/// so that git's carriage-return-driven progress meter (`Receiving objects: 45% (.../...)\r`)
/// counts as activity too — not just newline-terminated lines. Line-based reading would leave
/// the idle-activity timestamp stale for the entire duration of a large transfer (git's
/// progress meter never emits a trailing `\n` until each phase completes), which could trip
/// `IDLE_TIMEOUT` and kill a slow-but-perfectly-healthy fetch/pull/push.
fn stream_reader(
    mut reader: impl Read + Send + 'static,
    activity: Arc<Mutex<Instant>>,
    app: AppHandle,
    event: String,
    stream_name: &'static str,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut pending = Vec::new();
        let mut buf = [0u8; 4096];
        let emit = |app: &AppHandle, segment: &[u8]| {
            let line = String::from_utf8_lossy(segment).trim().to_string();
            if !line.is_empty() {
                let _ = app.emit(&event, GitOutputLine { stream: stream_name.into(), line });
            }
        };
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    *activity.lock().unwrap() = Instant::now();
                    pending.extend_from_slice(&buf[..n]);
                    while let Some(pos) = pending.iter().position(|&b| b == b'\n' || b == b'\r') {
                        let segment: Vec<u8> = pending.drain(..=pos).collect();
                        emit(&app, &segment[..segment.len() - 1]);
                    }
                }
                Err(_) => break,
            }
        }
        if !pending.is_empty() {
            emit(&app, &pending);
        }
    })
}

/// Tauri event names only allow `[a-zA-Z0-9-/:_]` — `event_id` is a filesystem path, which can
/// contain spaces and other characters outside that set (e.g. this repo's own
/// ".../Open Source/gitbud"). Using it raw in the event name makes the frontend's `listen()`
/// call reject with an illegal-event-name error instead of registering, which — since that
/// happens before the streaming op is even started — silently strands the UI in a permanent
/// "loading" state with nothing registered on the backend to cancel. base64url has no such
/// restricted characters, so it's safe to embed directly.
fn event_channel(event_id: &str) -> String {
    format!("git://{}", URL_SAFE_NO_PAD.encode(event_id))
}

/// Runs a system `git` subcommand, streaming each output line to the frontend as a
/// `git://<event_id>` event so long-running fetch/pull/push/clone can show live progress.
///
/// `cwd` is the working directory to run in, or `None` for clone (whose destination doesn't
/// exist yet). Never lets git prompt interactively for credentials — that has no terminal to
/// prompt on inside the app and previously caused pushes/pulls to hang forever with no error
/// and no way to cancel. Also enforces `IDLE_TIMEOUT` and registers the child so it can be
/// killed via `cancel`.
fn run_streaming(app: &AppHandle, cwd: Option<&str>, args: &[&str], event_id: &str) -> Result<(), String> {
    let mut command = Command::new(crate::settings::git_binary());
    command
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    if std::env::var_os("GIT_SSH_COMMAND").is_none() {
        command.env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes -o ConnectTimeout=15");
    }

    let mut child = command.spawn().map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    let last_activity = Arc::new(Mutex::new(Instant::now()));
    let cancelled = Arc::new(AtomicBool::new(false));
    let timed_out = Arc::new(AtomicBool::new(false));

    registry()
        .lock()
        .map_err(|_| "internal lock error".to_string())?
        .insert(event_id.to_string(), RunningOp { pid: child.id(), cancelled: Arc::clone(&cancelled) });

    let channel = event_channel(event_id);
    let out_handle = stream_reader(stdout, Arc::clone(&last_activity), app.clone(), channel.clone(), "stdout");
    let err_handle = stream_reader(stderr, Arc::clone(&last_activity), app.clone(), channel, "stderr");

    let done = Arc::new(AtomicBool::new(false));
    let watchdog_done = Arc::clone(&done);
    let watchdog_activity = Arc::clone(&last_activity);
    let watchdog_timed_out = Arc::clone(&timed_out);
    let pid = child.id();
    let watchdog = std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(2));
        if watchdog_done.load(Ordering::SeqCst) {
            return;
        }
        if watchdog_activity.lock().unwrap().elapsed() >= IDLE_TIMEOUT {
            watchdog_timed_out.store(true, Ordering::SeqCst);
            kill_pid(pid);
            return;
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    done.store(true, Ordering::SeqCst);
    let _ = out_handle.join();
    let _ = err_handle.join();
    let _ = watchdog.join();
    registry().lock().map_err(|_| "internal lock error".to_string())?.remove(event_id);

    if status.success() {
        Ok(())
    } else if cancelled.load(Ordering::SeqCst) {
        Err("Cancelled".to_string())
    } else if timed_out.load(Ordering::SeqCst) {
        Err(format!(
            "git {} produced no output for {}s and was cancelled. It was likely stuck waiting on a \
             credential or passphrase prompt it can't show. Set up a credential helper or a running \
             SSH agent (with the key already added) and try again.",
            args.join(" "),
            IDLE_TIMEOUT.as_secs()
        ))
    } else {
        Err(format!("git {} exited with {status}", args.join(" ")))
    }
}

pub fn fetch(app: &AppHandle, repo_path: &str, event_id: &str) -> Result<(), String> {
    run_streaming(app, Some(repo_path), &["fetch", "--prune", "--progress"], event_id)
}

pub fn pull(app: &AppHandle, repo_path: &str, event_id: &str) -> Result<(), String> {
    use crate::settings::PullStrategy;
    let strategy = crate::settings::get_settings().map(|s| s.pull_strategy).unwrap_or(PullStrategy::Merge);
    let args: &[&str] = match strategy {
        PullStrategy::Merge => &["pull", "--progress"],
        PullStrategy::Rebase => &["pull", "--rebase", "--progress"],
        PullStrategy::FfOnly => &["pull", "--ff-only", "--progress"],
    };
    run_streaming(app, Some(repo_path), args, event_id)
}

/// Always passes `-u origin HEAD` rather than a bare `git push` — harmless once a branch is
/// already tracking `origin`, but means a never-before-pushed ("unpublished") branch gets a
/// tracking branch set up on its very first push instead of failing with "no upstream branch".
/// `--progress` keeps a steady trickle of output flowing on a slow push instead of git going
/// silent for the whole transfer (git suppresses its progress meter by default on a non-tty
/// pipe, which is exactly what we give it here).
pub fn push(app: &AppHandle, repo_path: &str, event_id: &str) -> Result<(), String> {
    run_streaming(app, Some(repo_path), &["push", "-u", "origin", "HEAD", "--progress"], event_id)
}

pub fn lfs_pull(app: &AppHandle, repo_path: &str, event_id: &str) -> Result<(), String> {
    run_streaming(app, Some(repo_path), &["lfs", "pull"], event_id)
}

pub fn lfs_push(app: &AppHandle, repo_path: &str, branch: &str, event_id: &str) -> Result<(), String> {
    run_streaming(app, Some(repo_path), &["lfs", "push", "origin", branch], event_id)
}

/// Pushes a single ref (e.g. a tag name) to `origin`.
pub fn push_ref(app: &AppHandle, repo_path: &str, ref_name: &str, event_id: &str) -> Result<(), String> {
    run_streaming(app, Some(repo_path), &["push", "origin", ref_name], event_id)
}

/// Initializes and updates one submodule (by its path within the superproject). Shelled out
/// to system `git` rather than git2, same reasoning as fetch/pull/push/clone: submodule
/// update can require cloning over the network, and that means auth.
pub fn update_submodule(app: &AppHandle, repo_path: &str, submodule_path: &str, event_id: &str) -> Result<(), String> {
    run_streaming(app, Some(repo_path), &["submodule", "update", "--init", "--", submodule_path], event_id)
}

pub fn update_all_submodules(app: &AppHandle, repo_path: &str, event_id: &str) -> Result<(), String> {
    run_streaming(app, Some(repo_path), &["submodule", "update", "--init", "--recursive"], event_id)
}

pub fn clone(app: &AppHandle, url: &str, dest: &str, event_id: &str) -> Result<(), String> {
    run_streaming(app, None, &["clone", "--progress", url, dest], event_id)
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
    run_streaming(app, Some(repo_path), &["fetch", "origin", &refspec], event_id)?;
    run_streaming(app, Some(repo_path), &["checkout", &local_branch], event_id)?;
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
    run_streaming(app, Some(repo_path), &["fetch", "upstream"], event_id)?;
    let upstream_ref = format!("upstream/{branch}");
    run_streaming(app, Some(repo_path), &["merge", "--ff-only", &upstream_ref], event_id)
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
        Err(_) => return Ok(AheadBehind { ahead: 0, behind: 0, published: false }),
    };

    let (ahead, behind) = repo
        .graph_ahead_behind(local_oid, upstream_oid)
        .map_err(|e| e.message().to_string())?;
    Ok(AheadBehind { ahead, behind, published: true })
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
    Ok(Some(AheadBehind { ahead, behind, published: true }))
}

// `run_streaming` (and everything built on it — fetch/pull/push/clone/lfs_pull/etc, plus the
// idle-timeout watchdog and the kill-on-cancel path) needs a real `tauri::AppHandle` to emit
// progress events, which there's no lightweight way to construct in a unit test. That's the
// same reason these were never tested before this module grew a cancel registry. The one
// slice of that machinery that doesn't need an AppHandle — `cancel`'s registry lookup — is
// covered here; the rest is exercised by manually running the app.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_reports_no_running_operation_for_unknown_event_id() {
        let result = cancel("no-such-event-id");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No running git operation"));
    }
}
