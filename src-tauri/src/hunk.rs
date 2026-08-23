use crate::diff::apply_diff_settings;
use git2::{ApplyLocation, Delta, DiffOptions, Patch, Repository};

/// Builds a minimal unified-diff patch for a single hunk (identified by `hunk_index` within
/// the per-file patch) so it can be applied independently of the rest of the file's changes.
/// `reverse` flips the line polarity and swaps the old/new ranges — used to undo a hunk that's
/// already staged (i.e. "unstage this hunk").
fn hunk_patch_text(
    patch: &Patch,
    hunk_index: usize,
    old_path: &str,
    new_path: &str,
    delta: Delta,
    reverse: bool,
) -> Result<String, String> {
    let (hunk, lines_in_hunk) = patch.hunk(hunk_index).map_err(|e| e.message().to_string())?;

    let mut text = String::new();
    text.push_str(&format!("diff --git a/{old_path} b/{new_path}\n"));

    let is_new = delta == Delta::Added;
    let is_deleted = delta == Delta::Deleted;
    if is_new {
        text.push_str("--- /dev/null\n");
    } else {
        text.push_str(&format!("--- a/{old_path}\n"));
    }
    if is_deleted {
        text.push_str("+++ /dev/null\n");
    } else {
        text.push_str(&format!("+++ b/{new_path}\n"));
    }

    let (old_start, old_lines, new_start, new_lines) = (
        hunk.old_start(),
        hunk.old_lines(),
        hunk.new_start(),
        hunk.new_lines(),
    );
    let (h_old_start, h_old_lines, h_new_start, h_new_lines) = if reverse {
        (new_start, new_lines, old_start, old_lines)
    } else {
        (old_start, old_lines, new_start, new_lines)
    };
    text.push_str(&format!("@@ -{h_old_start},{h_old_lines} +{h_new_start},{h_new_lines} @@\n"));

    for i in 0..lines_in_hunk {
        let line = patch.line_in_hunk(hunk_index, i).map_err(|e| e.message().to_string())?;
        let content = std::str::from_utf8(line.content()).map_err(|e| e.to_string())?;
        let origin = match line.origin() {
            '+' if reverse => '-',
            '-' if reverse => '+',
            other => other,
        };
        match origin {
            '+' | '-' | ' ' => {
                text.push(origin);
                text.push_str(content);
                if !content.ends_with('\n') {
                    text.push('\n');
                }
            }
            _ => {}
        }
    }
    Ok(text)
}

fn single_file_patch<'a>(diff: &'a git2::Diff<'a>) -> Result<(Patch<'a>, Delta), String> {
    if diff.deltas().len() != 1 {
        return Err(format!(
            "expected exactly one changed file, found {}",
            diff.deltas().len()
        ));
    }
    let delta = diff.deltas().next().unwrap().status();
    let patch = Patch::from_diff(diff, 0)
        .map_err(|e| e.message().to_string())?
        .ok_or("no textual diff for this file (binary?)")?;
    Ok((patch, delta))
}

/// Stages a single hunk (by index into the file's *unstaged* diff) without staging the rest
/// of the file's changes. Whole-file adds/deletes are simpler to stage as a whole file, so
/// callers should prefer `stage_paths` for those (this still works, but hunk 0 == the entire
/// file's content in that case).
pub fn stage_hunk(repo_path: &str, path: &str, hunk_index: usize) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut opts = DiffOptions::new();
    opts.pathspec(path).include_untracked(true).recurse_untracked_dirs(true);
    apply_diff_settings(&mut opts);
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    let (patch, delta) = single_file_patch(&diff)?;
    let text = hunk_patch_text(&patch, hunk_index, path, path, delta, false)?;
    let patch_diff = git2::Diff::from_buffer(text.as_bytes()).map_err(|e| e.message().to_string())?;
    repo.apply(&patch_diff, ApplyLocation::Index, None)
        .map_err(|e| e.message().to_string())
}

/// Unstages a single hunk (by index into the file's *staged* diff, i.e. HEAD vs. index)
/// without touching the rest of the file's staged changes.
pub fn unstage_hunk(repo_path: &str, path: &str, hunk_index: usize) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut opts = DiffOptions::new();
    opts.pathspec(path);
    apply_diff_settings(&mut opts);
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let diff = repo
        .diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    let (patch, delta) = single_file_patch(&diff)?;
    let text = hunk_patch_text(&patch, hunk_index, path, path, delta, true)?;
    let patch_diff = git2::Diff::from_buffer(text.as_bytes()).map_err(|e| e.message().to_string())?;
    repo.apply(&patch_diff, ApplyLocation::Index, None)
        .map_err(|e| e.message().to_string())
}

/// Discards a single hunk from the working tree (by index into the file's *unstaged* diff),
/// leaving the rest of the file's uncommitted changes intact.
pub fn discard_hunk(repo_path: &str, path: &str, hunk_index: usize) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut opts = DiffOptions::new();
    opts.pathspec(path).include_untracked(true).recurse_untracked_dirs(true);
    apply_diff_settings(&mut opts);
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    let (patch, delta) = single_file_patch(&diff)?;
    let text = hunk_patch_text(&patch, hunk_index, path, path, delta, true)?;
    let patch_diff = git2::Diff::from_buffer(text.as_bytes()).map_err(|e| e.message().to_string())?;
    repo.apply(&patch_diff, ApplyLocation::WorkDir, None)
        .map_err(|e| e.message().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo;

    struct ScratchRepo {
        path: std::path::PathBuf,
    }

    impl ScratchRepo {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "gitbud-test-hunk-{name}-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(&path).unwrap();
            let repo = Repository::init(&path).unwrap();
            let mut config = repo.config().unwrap();
            config.set_str("user.name", "Test").unwrap();
            config.set_str("user.email", "test@example.com").unwrap();
            Self { path }
        }

        fn path_str(&self) -> String {
            self.path.to_string_lossy().to_string()
        }
    }

    impl Drop for ScratchRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn multiline_file(n: usize) -> String {
        (1..=n).map(|i| format!("line {i}\n")).collect()
    }

    #[test]
    fn stage_hunk_stages_only_that_hunk() {
        let scratch = ScratchRepo::new("stage");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("f.txt"), multiline_file(20)).unwrap();
        repo::stage_paths(&repo_path, &["f.txt".to_string()]).unwrap();
        repo::commit(&repo_path, "base", "").unwrap();

        // Two separate, far-apart edits -> two hunks.
        let mut lines: Vec<String> = (1..=20).map(|i| format!("line {i}")).collect();
        lines[1] = "line 2 CHANGED".to_string();
        lines[17] = "line 18 CHANGED".to_string();
        let content = lines.join("\n") + "\n";
        std::fs::write(scratch.path.join("f.txt"), &content).unwrap();

        stage_hunk(&repo_path, "f.txt", 0).unwrap();

        let status = repo::get_status(&repo_path).unwrap();
        let entry = status.files.iter().find(|f| f.path == "f.txt").unwrap();
        // Still has unstaged changes (the second hunk) alongside the staged first hunk.
        assert!(!entry.staged || status.files.len() == 1);

        let staged_diff = crate::diff::get_file_diff(&repo_path, "f.txt", true).unwrap();
        assert!(staged_diff
            .hunks
            .iter()
            .any(|h| h.lines.iter().any(|l| l.content.contains("line 2 CHANGED"))));
        assert!(!staged_diff
            .hunks
            .iter()
            .any(|h| h.lines.iter().any(|l| l.content.contains("line 18 CHANGED"))));

        let unstaged_diff = crate::diff::get_file_diff(&repo_path, "f.txt", false).unwrap();
        assert!(unstaged_diff
            .hunks
            .iter()
            .any(|h| h.lines.iter().any(|l| l.content.contains("line 18 CHANGED"))));
    }

    #[test]
    fn unstage_hunk_reverses_only_that_hunk() {
        let scratch = ScratchRepo::new("unstage");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("f.txt"), multiline_file(20)).unwrap();
        repo::stage_paths(&repo_path, &["f.txt".to_string()]).unwrap();
        repo::commit(&repo_path, "base", "").unwrap();

        let mut lines: Vec<String> = (1..=20).map(|i| format!("line {i}")).collect();
        lines[1] = "line 2 CHANGED".to_string();
        lines[17] = "line 18 CHANGED".to_string();
        let content = lines.join("\n") + "\n";
        std::fs::write(scratch.path.join("f.txt"), &content).unwrap();
        repo::stage_paths(&repo_path, &["f.txt".to_string()]).unwrap();

        unstage_hunk(&repo_path, "f.txt", 0).unwrap();

        let staged_diff = crate::diff::get_file_diff(&repo_path, "f.txt", true).unwrap();
        assert!(!staged_diff
            .hunks
            .iter()
            .any(|h| h.lines.iter().any(|l| l.content.contains("line 2 CHANGED"))));
        assert!(staged_diff
            .hunks
            .iter()
            .any(|h| h.lines.iter().any(|l| l.content.contains("line 18 CHANGED"))));
    }

    #[test]
    fn discard_hunk_reverts_only_that_hunk_in_workdir() {
        let scratch = ScratchRepo::new("discard-hunk");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("f.txt"), multiline_file(20)).unwrap();
        repo::stage_paths(&repo_path, &["f.txt".to_string()]).unwrap();
        repo::commit(&repo_path, "base", "").unwrap();

        let mut lines: Vec<String> = (1..=20).map(|i| format!("line {i}")).collect();
        lines[1] = "line 2 CHANGED".to_string();
        lines[17] = "line 18 CHANGED".to_string();
        let content = lines.join("\n") + "\n";
        std::fs::write(scratch.path.join("f.txt"), &content).unwrap();

        discard_hunk(&repo_path, "f.txt", 0).unwrap();

        let on_disk = std::fs::read_to_string(scratch.path.join("f.txt")).unwrap();
        assert!(!on_disk.contains("line 2 CHANGED"));
        assert!(on_disk.contains("line 18 CHANGED"));
    }
}
