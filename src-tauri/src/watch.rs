use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const DEBOUNCE: Duration = Duration::from_millis(150);

fn is_noise(event: &Event) -> bool {
    event.paths.iter().all(|p| {
        let s = p.to_string_lossy();
        // Lock files and loose objects churn constantly during *any* git operation
        // (ours or an external `git` process's) without being a meaningful state change
        // by themselves — the ref/index/HEAD update that follows is what we care about,
        // and that isn't inside these. Everything else in .git/ (refs, HEAD, index,
        // logs, stash) is watched, so a commit/checkout/stash/merge run from a terminal
        // or another tool is picked up here too, not just edits to tracked files.
        s.ends_with(".lock") || s.contains("/.git/objects/")
    })
}

/// Watches `repo_path` recursively and emits a debounced `repo-changed` event (payload:
/// the repo path) once fs activity outside `.git/` goes quiet for `DEBOUNCE`.
/// The returned watcher must be kept alive by the caller (e.g. in Tauri managed state) —
/// dropping it stops the watch.
pub fn start_watching(app: AppHandle, repo_path: String) -> Result<RecommendedWatcher, String> {
    let (tx, rx) = channel::<notify::Result<Event>>();
    let mut watcher =
        notify::recommended_watcher(move |res| { let _ = tx.send(res); }).map_err(|e| e.to_string())?;
    watcher
        .watch(std::path::Path::new(&repo_path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    std::thread::spawn(move || loop {
        let event = match rx.recv() {
            Ok(Ok(event)) => event,
            Ok(Err(_)) => continue,
            Err(_) => return, // watcher dropped
        };
        let mut dirty = !is_noise(&event);

        loop {
            match rx.recv_timeout(DEBOUNCE) {
                Ok(Ok(event)) => {
                    dirty = dirty || !is_noise(&event);
                }
                Ok(Err(_)) => continue,
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }

        if dirty {
            let _ = app.emit("repo-changed", &repo_path);
        }
    });

    Ok(watcher)
}
