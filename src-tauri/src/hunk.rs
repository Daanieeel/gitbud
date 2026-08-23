use crate::diff::apply_diff_settings;
use git2::{ApplyLocation, Delta, DiffOptions, Patch, Repository};

/// Builds a minimal unified-diff patch for a single hunk (identified by `hunk_index` within
/// the per-file patch) so it can be applied independently of the rest of the file's changes.
/// `reverse` flips the line polarity and swaps the old/new ranges — used to undo a hunk that's
/// already staged (i.e. "unstage this hunk").
///
/// `selected_lines`, when given, restricts this to a subset of the hunk's +/- lines — indices
/// into the same 0-based per-hunk line ordering `patch.line_in_hunk` (and `DiffHunk.lines[]`
/// on the frontend) uses for whichever diff this patch was built from, *before* the reverse
/// flip below (the flip only changes each line's `+`/`-` origin, never its position). An
/// unselected `+` line is dropped entirely (it doesn't exist yet as far as this patch is
/// concerned); an unselected `-` line is turned into context (kept as-is, since it isn't being
/// removed by this particular patch). This is the same technique `git add -p`'s own line-level
/// staging uses. `None` keeps every line, i.e. stages the whole hunk exactly as before this
/// existed.
fn hunk_patch_text(
    patch: &Patch,
    hunk_index: usize,
    old_path: &str,
    new_path: &str,
    delta: Delta,
    reverse: bool,
    selected_lines: Option<&std::collections::HashSet<usize>>,
) -> Result<String, String> {
    let (hunk, lines_in_hunk) = patch.hunk(hunk_index).map_err(|e| e.message().to_string())?;

    // Collect (origin, content) for every line first, applying both the reverse flip and the
    // line-selection filter, so the header's counts can be computed from what's actually going
    // to be written rather than assumed from the unfiltered hunk.
    let mut lines: Vec<(char, String)> = Vec::with_capacity(lines_in_hunk);
    for i in 0..lines_in_hunk {
        let line = patch.line_in_hunk(hunk_index, i).map_err(|e| e.message().to_string())?;
        let content = std::str::from_utf8(line.content()).map_err(|e| e.to_string())?.to_string();
        let origin = match line.origin() {
            '+' if reverse => '-',
            '-' if reverse => '+',
            other => other,
        };
        let origin = match (origin, selected_lines) {
            ('+' | '-' | ' ', None) => origin,
            (' ', Some(_)) => ' ',
            ('+', Some(selected)) if selected.contains(&i) => '+',
            ('+', Some(_)) => continue, // unselected addition: doesn't exist yet — drop it
            ('-', Some(selected)) if selected.contains(&i) => '-',
            ('-', Some(_)) => ' ', // unselected deletion: not being removed — keep as context
            _ => continue,
        };
        lines.push((origin, content));
    }

    let old_lines_count = lines.iter().filter(|(o, _)| *o == '-' || *o == ' ').count() as u32;
    let new_lines_count = lines.iter().filter(|(o, _)| *o == '+' || *o == ' ').count() as u32;

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

    let (old_start, new_start) = if reverse {
        (hunk.new_start(), hunk.old_start())
    } else {
        (hunk.old_start(), hunk.new_start())
    };
    text.push_str(&format!("@@ -{old_start},{old_lines_count} +{new_start},{new_lines_count} @@\n"));

    for (origin, content) in &lines {
        text.push(*origin);
        text.push_str(content);
        if !content.ends_with('\n') {
            text.push('\n');
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
    let text = hunk_patch_text(&patch, hunk_index, path, path, delta, false, None)?;
    let patch_diff = git2::Diff::from_buffer(text.as_bytes()).map_err(|e| e.message().to_string())?;
    repo.apply(&patch_diff, ApplyLocation::Index, None)
        .map_err(|e| e.message().to_string())
}

/// Stages only `line_indices` within a single hunk (by index into the file's *unstaged* diff),
/// leaving the rest of the hunk's lines — and the rest of the file — untouched.
pub fn stage_hunk_lines(repo_path: &str, path: &str, hunk_index: usize, line_indices: &[usize]) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut opts = DiffOptions::new();
    opts.pathspec(path).include_untracked(true).recurse_untracked_dirs(true);
    apply_diff_settings(&mut opts);
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    let (patch, delta) = single_file_patch(&diff)?;
    let selected: std::collections::HashSet<usize> = line_indices.iter().copied().collect();
    let text = hunk_patch_text(&patch, hunk_index, path, path, delta, false, Some(&selected))?;
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
    let text = hunk_patch_text(&patch, hunk_index, path, path, delta, true, None)?;
    let patch_diff = git2::Diff::from_buffer(text.as_bytes()).map_err(|e| e.message().to_string())?;
    repo.apply(&patch_diff, ApplyLocation::Index, None)
        .map_err(|e| e.message().to_string())
}

/// Unstages only `line_indices` within a single hunk (by index into the file's *staged* diff),
/// leaving the rest of the hunk's staged lines untouched.
pub fn unstage_hunk_lines(repo_path: &str, path: &str, hunk_index: usize, line_indices: &[usize]) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut opts = DiffOptions::new();
    opts.pathspec(path);
    apply_diff_settings(&mut opts);
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let diff = repo
        .diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    let (patch, delta) = single_file_patch(&diff)?;
    let selected: std::collections::HashSet<usize> = line_indices.iter().copied().collect();
    let text = hunk_patch_text(&patch, hunk_index, path, path, delta, true, Some(&selected))?;
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
    let text = hunk_patch_text(&patch, hunk_index, path, path, delta, true, None)?;
    let patch_diff = git2::Diff::from_buffer(text.as_bytes()).map_err(|e| e.message().to_string())?;
    repo.apply(&patch_diff, ApplyLocation::WorkDir, None)
        .map_err(|e| e.message().to_string())
}

/// Discards only `line_indices` within a single hunk from the working tree (by index into the
/// file's *unstaged* diff), leaving the rest of the hunk's lines and the rest of the file intact.
pub fn discard_hunk_lines(repo_path: &str, path: &str, hunk_index: usize, line_indices: &[usize]) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut opts = DiffOptions::new();
    opts.pathspec(path).include_untracked(true).recurse_untracked_dirs(true);
    apply_diff_settings(&mut opts);
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    let (patch, delta) = single_file_patch(&diff)?;
    let selected: std::collections::HashSet<usize> = line_indices.iter().copied().collect();
    let text = hunk_patch_text(&patch, hunk_index, path, path, delta, true, Some(&selected))?;
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

    /// Two modified lines close enough together to land in one hunk, so a "stage/unstage/
    /// discard just this line" action can be tested against a sibling change it must leave
    /// alone. Returns (repo_path, del_index, add_index) for line 5's change specifically —
    /// each modified line is a delete+add pair, so "select this line's change" means both.
    fn two_line_change_in_one_hunk(scratch: &ScratchRepo) -> (usize, usize) {
        let repo_path = scratch.path_str();
        std::fs::write(scratch.path.join("f.txt"), multiline_file(10)).unwrap();
        repo::stage_paths(&repo_path, &["f.txt".to_string()]).unwrap();
        repo::commit(&repo_path, "base", "").unwrap();

        let mut lines: Vec<String> = (1..=10).map(|i| format!("line {i}")).collect();
        lines[4] = "line 5 CHANGED".to_string();
        lines[6] = "line 7 CHANGED".to_string();
        let content = lines.join("\n") + "\n";
        std::fs::write(scratch.path.join("f.txt"), &content).unwrap();

        let diff = crate::diff::get_file_diff(&repo_path, "f.txt", false).unwrap();
        assert_eq!(diff.hunks.len(), 1, "both edits should land in one hunk");
        let hunk = &diff.hunks[0];
        let del_index = hunk.lines.iter().position(|l| l.content == "line 5").unwrap();
        let add_index = hunk.lines.iter().position(|l| l.content == "line 5 CHANGED").unwrap();
        (del_index, add_index)
    }

    /// True if any line in `diff` is an Addition or Deletion (i.e. a real change, not context)
    /// whose content is `text` — a context line can legitimately carry post-change content
    /// once both sides agree again, so a plain content search alone isn't enough to tell
    /// "still shows as changed" from "resolved".
    fn has_changed_line(diff: &crate::diff::FileDiff, text: &str) -> bool {
        diff.hunks.iter().any(|h| {
            h.lines
                .iter()
                .any(|l| l.content == text && l.kind != crate::diff::LineKind::Context)
        })
    }

    #[test]
    fn stage_hunk_lines_stages_only_the_selected_lines() {
        let scratch = ScratchRepo::new("stage-lines");
        let (del_index, add_index) = two_line_change_in_one_hunk(&scratch);
        let repo_path = scratch.path_str();

        stage_hunk_lines(&repo_path, "f.txt", 0, &[del_index, add_index]).unwrap();

        let staged_diff = crate::diff::get_file_diff(&repo_path, "f.txt", true).unwrap();
        assert!(has_changed_line(&staged_diff, "line 5 CHANGED"));
        assert!(!has_changed_line(&staged_diff, "line 7 CHANGED"));

        let unstaged_diff = crate::diff::get_file_diff(&repo_path, "f.txt", false).unwrap();
        assert!(!has_changed_line(&unstaged_diff, "line 5 CHANGED"));
        assert!(has_changed_line(&unstaged_diff, "line 7 CHANGED"));
    }

    #[test]
    fn unstage_hunk_lines_unstages_only_the_selected_lines() {
        let scratch = ScratchRepo::new("unstage-lines");
        two_line_change_in_one_hunk(&scratch);
        let repo_path = scratch.path_str();
        repo::stage_paths(&repo_path, &["f.txt".to_string()]).unwrap();

        // Recompute against the now-staged (HEAD-vs-index) diff — a fresh Patch, so its line
        // indices for this same content don't need to match the unstaged diff's.
        let staged_diff = crate::diff::get_file_diff(&repo_path, "f.txt", true).unwrap();
        let hunk = &staged_diff.hunks[0];
        let staged_del = hunk.lines.iter().position(|l| l.content == "line 5").unwrap();
        let staged_add = hunk.lines.iter().position(|l| l.content == "line 5 CHANGED").unwrap();

        unstage_hunk_lines(&repo_path, "f.txt", 0, &[staged_del, staged_add]).unwrap();

        let staged_diff = crate::diff::get_file_diff(&repo_path, "f.txt", true).unwrap();
        assert!(!has_changed_line(&staged_diff, "line 5 CHANGED"));
        assert!(has_changed_line(&staged_diff, "line 7 CHANGED"));

        let unstaged_diff = crate::diff::get_file_diff(&repo_path, "f.txt", false).unwrap();
        assert!(has_changed_line(&unstaged_diff, "line 5 CHANGED"));
        assert!(!has_changed_line(&unstaged_diff, "line 7 CHANGED"));
    }

    #[test]
    fn discard_hunk_lines_discards_only_the_selected_lines() {
        let scratch = ScratchRepo::new("discard-lines");
        let (del_index, add_index) = two_line_change_in_one_hunk(&scratch);
        let repo_path = scratch.path_str();

        discard_hunk_lines(&repo_path, "f.txt", 0, &[del_index, add_index]).unwrap();

        let on_disk = std::fs::read_to_string(scratch.path.join("f.txt")).unwrap();
        assert!(!on_disk.contains("line 5 CHANGED"));
        assert!(on_disk.contains("line 5\n"));
        assert!(on_disk.contains("line 7 CHANGED"));
    }
}
