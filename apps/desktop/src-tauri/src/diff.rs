use git2::{Diff, DiffOptions, Repository};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LineKind {
    Context,
    Addition,
    Deletion,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub kind: LineKind,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
    /// [start, end) character ranges into `content` that changed at the word level, relative to
    /// this line's paired counterpart on the other side of the edit (a deletion's ranges are
    /// relative to the addition that replaced it, and vice versa). Empty for context lines and
    /// for add/delete lines with no same-position counterpart to compare against — those still
    /// render as a plain whole-line change.
    #[serde(default)]
    pub highlight_ranges: Vec<(u32, u32)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub is_binary: bool,
    pub is_image: bool,
    pub hunks: Vec<DiffHunk>,
}

/// A PR file's `(filename, status, diff)`, as returned by the GitHub API and cached as-is.
pub type PrFileEntry = (String, String, FileDiff);

fn build_file_diff(path: &str, old_path: Option<&str>, diff: &Diff) -> Result<FileDiff, String> {
    let is_binary = RefCell::new(false);
    let hunks: RefCell<Vec<DiffHunk>> = RefCell::new(Vec::new());

    diff.foreach(
        &mut |delta, _progress| {
            if delta.flags().is_binary() {
                *is_binary.borrow_mut() = true;
            }
            true
        },
        None,
        Some(&mut |_delta, hunk| {
            hunks.borrow_mut().push(DiffHunk {
                header: String::from_utf8_lossy(hunk.header())
                    .trim_end()
                    .to_string(),
                lines: Vec::new(),
            });
            true
        }),
        Some(&mut |_delta, _hunk, line| {
            let kind = match line.origin() {
                '+' => LineKind::Addition,
                '-' => LineKind::Deletion,
                _ => LineKind::Context,
            };
            let content = String::from_utf8_lossy(line.content())
                .trim_end_matches('\n')
                .to_string();
            let diff_line = DiffLine {
                kind,
                content,
                old_lineno: line.old_lineno(),
                new_lineno: line.new_lineno(),
                highlight_ranges: Vec::new(),
            };
            if let Some(last) = hunks.borrow_mut().last_mut() {
                last.lines.push(diff_line);
            }
            true
        }),
    )
    .map_err(|e| e.message().to_string())?;

    let mut hunks = hunks.into_inner();
    add_intraline_highlights(&mut hunks);

    Ok(FileDiff {
        is_image: crate::image_diff::is_image_path(path),
        path: path.to_string(),
        old_path: old_path.map(|s| s.to_string()),
        is_binary: is_binary.into_inner(),
        hunks,
    })
}

/// Character-level diff between one deletion/addition line pair, returning [start, end)
/// *character* offsets (not bytes — matches how the frontend counts positions in `content` when
/// overlaying these onto its syntax-highlighted HTML) into `old`/`new` respectively for the
/// substrings that actually changed. Char-level rather than word-level on purpose: code changes
/// very often land inside a single "word" by whitespace's definition (e.g. `compute_old` ->
/// `compute_new`), which a word-level diff would highlight in its entirety instead of just the
/// `old`/`new` part that changed. Equal stretches are left unhighlighted so only the substantive
/// change stands out.
/// [start, end) character ranges into a line's content that changed.
type CharRanges = Vec<(u32, u32)>;

fn intraline_diff(old: &str, new: &str) -> (CharRanges, CharRanges) {
    use similar::{ChangeTag, TextDiff};

    let diff = TextDiff::from_chars(old, new);
    let mut old_ranges = Vec::new();
    let mut new_ranges = Vec::new();
    let mut old_pos: u32 = 0;
    let mut new_pos: u32 = 0;

    for change in diff.iter_all_changes() {
        let len = change.value().chars().count() as u32;
        match change.tag() {
            ChangeTag::Equal => {
                old_pos += len;
                new_pos += len;
            }
            ChangeTag::Delete => {
                old_ranges.push((old_pos, old_pos + len));
                old_pos += len;
            }
            ChangeTag::Insert => {
                new_ranges.push((new_pos, new_pos + len));
                new_pos += len;
            }
        }
    }
    (old_ranges, new_ranges)
}

/// Above this many changed characters on either side of a paired line, intraline highlighting
/// is skipped in favor of showing the whole line removed/added: past this point there's enough
/// coincidental single-character overlap between the old and new text that highlighting just
/// the "changed" ranges tends to look noisy and arbitrary rather than clarifying anything.
const MAX_HIGHLIGHTED_CHANGE_LEN: u32 = 15;

/// `TextDiff::from_chars` is roughly O(n·m) in the two lines' lengths — fine for ordinary code
/// lines, but a single-line minified asset, lockfile entry, or generated JSON blob can run into
/// the thousands of characters, where that cost becomes multiple seconds for one file. A line
/// this long is already all but guaranteed to blow past `MAX_HIGHLIGHTED_CHANGE_LEN` (a change
/// small enough to still be worth highlighting inside a genuinely huge line is vanishingly
/// rare), so it's skipped outright rather than diffed and then discarded.
const MAX_INTRALINE_DIFF_LEN: usize = 2000;

fn ranges_total_len(ranges: &[(u32, u32)]) -> u32 {
    ranges.iter().map(|(start, end)| end - start).sum()
}

/// Finds each hunk's "replace" blocks — a run of deletion lines immediately followed by a run
/// of addition lines, git's usual shape for "this line changed" — and fills in `highlight_ranges`
/// for the lines that pair up 1:1 across the two runs (extra lines on the longer side are left
/// as plain whole-line changes, same as before this existed).
pub fn add_intraline_highlights(hunks: &mut [DiffHunk]) {
    for hunk in hunks {
        let mut i = 0;
        while i < hunk.lines.len() {
            if hunk.lines[i].kind != LineKind::Deletion {
                i += 1;
                continue;
            }
            let del_start = i;
            while i < hunk.lines.len() && hunk.lines[i].kind == LineKind::Deletion {
                i += 1;
            }
            let del_end = i;
            let add_start = i;
            while i < hunk.lines.len() && hunk.lines[i].kind == LineKind::Addition {
                i += 1;
            }
            let add_end = i;

            let pair_count = (del_end - del_start).min(add_end - add_start);
            for offset in 0..pair_count {
                let old_content = &hunk.lines[del_start + offset].content;
                let new_content = &hunk.lines[add_start + offset].content;
                if old_content.len() > MAX_INTRALINE_DIFF_LEN
                    || new_content.len() > MAX_INTRALINE_DIFF_LEN
                {
                    continue;
                }
                let (old_ranges, new_ranges) = intraline_diff(old_content, new_content);
                if ranges_total_len(&old_ranges) > MAX_HIGHLIGHTED_CHANGE_LEN
                    || ranges_total_len(&new_ranges) > MAX_HIGHLIGHTED_CHANGE_LEN
                {
                    continue;
                }
                hunk.lines[del_start + offset].highlight_ranges = old_ranges;
                hunk.lines[add_start + offset].highlight_ranges = new_ranges;
            }
        }
    }
}

/// Applies the user's whitespace-handling and diff-algorithm preferences to a set of diff
/// options — the one place every diff/hunk-staging call site goes through so both settings
/// take effect everywhere consistently.
pub(crate) fn apply_diff_settings(opts: &mut DiffOptions) {
    let settings = crate::settings::get_settings().unwrap_or_default();
    if settings.ignore_whitespace {
        opts.ignore_whitespace(true);
    }
    use crate::settings::DiffAlgorithm;
    match settings.diff_algorithm {
        DiffAlgorithm::Myers => {}
        DiffAlgorithm::Minimal => {
            opts.minimal(true);
        }
        DiffAlgorithm::Patience => {
            opts.patience(true);
        }
    }
}

pub fn get_file_diff(repo_path: &str, path: &str, staged: bool) -> Result<FileDiff, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut opts = DiffOptions::new();
    opts.pathspec(path)
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .show_untracked_content(true);
    apply_diff_settings(&mut opts);

    let diff = if staged {
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
    } else {
        repo.diff_index_to_workdir(None, Some(&mut opts))
    }
    .map_err(|e| e.message().to_string())?;

    build_file_diff(path, None, &diff)
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
                "gitbud-test-{name}-{}",
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
            config.set_bool("core.autocrlf", false).unwrap();
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

    #[test]
    fn stage_commit_and_diff_roundtrip() {
        let scratch = ScratchRepo::new("diff-roundtrip");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("hello.txt"), "line one\n").unwrap();
        repo::stage_paths(&repo_path, &["hello.txt".to_string()]).unwrap();
        let oid = repo::commit(&repo_path, "initial commit", "").unwrap();

        // Unstaged modification produces an index->workdir diff.
        std::fs::write(scratch.path.join("hello.txt"), "line one\nline two\n").unwrap();
        let unstaged = get_file_diff(&repo_path, "hello.txt", false).unwrap();
        assert!(!unstaged.is_binary);
        assert!(unstaged
            .hunks
            .iter()
            .any(|h| h.lines.iter().any(|l| l.kind == LineKind::Addition)));

        // Staging moves the same change into the HEAD->index diff.
        repo::stage_paths(&repo_path, &["hello.txt".to_string()]).unwrap();
        let staged = get_file_diff(&repo_path, "hello.txt", true).unwrap();
        assert!(staged
            .hunks
            .iter()
            .any(|h| h.lines.iter().any(|l| l.kind == LineKind::Addition)));

        // The commit-diff path (used by History) sees the same content for the first commit.
        let files = get_commit_files(&repo_path, &oid).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].0, "hello.txt");
    }

    #[test]
    fn unstage_reverts_index_to_head() {
        let scratch = ScratchRepo::new("unstage");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("a.txt"), "a\n").unwrap();
        repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        repo::commit(&repo_path, "add a", "").unwrap();

        std::fs::write(scratch.path.join("a.txt"), "a\nb\n").unwrap();
        repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        let staged_before = repo::get_status(&repo_path).unwrap();
        assert!(staged_before
            .files
            .iter()
            .any(|f| f.path == "a.txt" && f.staged));

        repo::unstage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        let staged_after = repo::get_status(&repo_path).unwrap();
        assert!(staged_after
            .files
            .iter()
            .any(|f| f.path == "a.txt" && !f.staged));
    }

    fn line(kind: LineKind, content: &str) -> DiffLine {
        DiffLine {
            kind,
            content: content.to_string(),
            old_lineno: None,
            new_lineno: None,
            highlight_ranges: Vec::new(),
        }
    }

    #[test]
    fn intraline_highlights_only_the_changed_word() {
        let mut hunks = vec![DiffHunk {
            header: String::new(),
            lines: vec![
                line(LineKind::Deletion, "let value = compute_old(x);"),
                line(LineKind::Addition, "let value = compute_new(x);"),
            ],
        }];
        add_intraline_highlights(&mut hunks);

        let del = &hunks[0].lines[0];
        let add = &hunks[0].lines[1];
        assert!(!del.highlight_ranges.is_empty());
        assert!(!add.highlight_ranges.is_empty());

        let del_chars: Vec<char> = del.content.chars().collect();
        let highlighted: String = del
            .highlight_ranges
            .iter()
            .flat_map(|&(start, end)| del_chars[start as usize..end as usize].iter())
            .collect();
        assert_eq!(highlighted, "old");

        let add_chars: Vec<char> = add.content.chars().collect();
        let highlighted: String = add
            .highlight_ranges
            .iter()
            .flat_map(|&(start, end)| add_chars[start as usize..end as usize].iter())
            .collect();
        assert_eq!(highlighted, "new");
    }

    #[test]
    fn intraline_leaves_unpaired_lines_unhighlighted() {
        // Two deletions, one addition — the first deletion pairs with the addition and gets
        // highlighted; the extra second deletion has no counterpart and stays a plain
        // whole-line change.
        let mut hunks = vec![DiffHunk {
            header: String::new(),
            lines: vec![
                line(LineKind::Deletion, "a"),
                line(LineKind::Deletion, "c"),
                line(LineKind::Addition, "b"),
            ],
        }];
        add_intraline_highlights(&mut hunks);

        assert!(!hunks[0].lines[0].highlight_ranges.is_empty());
        assert!(hunks[0].lines[1].highlight_ranges.is_empty());
        assert!(!hunks[0].lines[2].highlight_ranges.is_empty());
    }

    #[test]
    fn intraline_skips_highlighting_past_the_length_threshold() {
        // The whole first half of the line differs — well past MAX_HIGHLIGHTED_CHANGE_LEN —
        // so both sides should fall back to a plain whole-line change instead of a highlight
        // that would otherwise land on almost the entire line.
        let mut hunks = vec![DiffHunk {
            header: String::new(),
            lines: vec![
                line(
                    LineKind::Deletion,
                    "this whole first section is completely different, end",
                ),
                line(
                    LineKind::Addition,
                    "a totally rewritten opening passage right here, end",
                ),
            ],
        }];
        add_intraline_highlights(&mut hunks);

        assert!(hunks[0].lines[0].highlight_ranges.is_empty());
        assert!(hunks[0].lines[1].highlight_ranges.is_empty());
    }
}

/// List the files changed by a commit relative to its first parent (or the empty tree, for a root commit).
pub fn get_commit_files(repo_path: &str, oid: &str) -> Result<Vec<(String, String)>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let commit = repo
        .find_commit(git2::Oid::from_str(oid).map_err(|e| e.message().to_string())?)
        .map_err(|e| e.message().to_string())?;
    let tree = commit.tree().map_err(|e| e.message().to_string())?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(|e| e.message().to_string())?;

    let mut files = Vec::new();
    for delta in diff.deltas() {
        let path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let status = format!("{:?}", delta.status());
        files.push((path, status));
    }
    Ok(files)
}

/// Diff a single file within a commit against its first parent (or empty tree for a root commit).
pub fn get_commit_file_diff(repo_path: &str, oid: &str, path: &str) -> Result<FileDiff, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let commit = repo
        .find_commit(git2::Oid::from_str(oid).map_err(|e| e.message().to_string())?)
        .map_err(|e| e.message().to_string())?;
    let tree = commit.tree().map_err(|e| e.message().to_string())?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

    let mut opts = DiffOptions::new();
    opts.pathspec(path);
    apply_diff_settings(&mut opts);

    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    build_file_diff(path, None, &diff)
}

/// Resolves the tree each side of a `base...head` (three-dot, merge-base) diff should compare
/// against — the same comparison GitHub shows on a pull request, so the preview matches what
/// will actually appear once opened.
pub(crate) fn branch_diff_trees<'a>(
    repo: &'a Repository,
    base: &str,
    head: &str,
) -> Result<(git2::Tree<'a>, git2::Tree<'a>), String> {
    let base_oid = repo
        .revparse_single(base)
        .map_err(|e| e.message().to_string())?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?
        .id();
    let head_oid = repo
        .revparse_single(head)
        .map_err(|e| e.message().to_string())?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?
        .id();
    let merge_base = repo
        .merge_base(base_oid, head_oid)
        .map_err(|e| e.message().to_string())?;
    let base_tree = repo
        .find_commit(merge_base)
        .and_then(|c| c.tree())
        .map_err(|e| e.message().to_string())?;
    let head_tree = repo
        .find_commit(head_oid)
        .and_then(|c| c.tree())
        .map_err(|e| e.message().to_string())?;
    Ok((base_tree, head_tree))
}

/// List the files a pull request from `head` into `base` would show, per the same
/// merge-base comparison GitHub uses.
pub fn get_branch_diff_files(
    repo_path: &str,
    base: &str,
    head: &str,
) -> Result<Vec<(String, String)>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let (base_tree, head_tree) = branch_diff_trees(&repo, base, head)?;

    let diff = repo
        .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), None)
        .map_err(|e| e.message().to_string())?;

    let mut files = Vec::new();
    for delta in diff.deltas() {
        let path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let status = format!("{:?}", delta.status());
        files.push((path, status));
    }
    Ok(files)
}

/// Total insertions/deletions across a `base...head` comparison — cheap (no hunk/line content
/// built, unlike `get_branch_diff_file`) since `get_branch_diff_files` itself carries no stats
/// and fetching every file's full diff just to sum line counts would be needlessly expensive for
/// what the create-PR dialog's sidebar shows as a single "+N -M" summary.
pub fn get_branch_diff_stats(
    repo_path: &str,
    base: &str,
    head: &str,
) -> Result<(usize, usize), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let (base_tree, head_tree) = branch_diff_trees(&repo, base, head)?;

    let diff = repo
        .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), None)
        .map_err(|e| e.message().to_string())?;
    let stats = diff.stats().map_err(|e| e.message().to_string())?;

    Ok((stats.insertions(), stats.deletions()))
}

/// Diff a single file as part of a `base...head` branch comparison (see `get_branch_diff_files`).
pub fn get_branch_diff_file(
    repo_path: &str,
    base: &str,
    head: &str,
    path: &str,
) -> Result<FileDiff, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let (base_tree, head_tree) = branch_diff_trees(&repo, base, head)?;

    let mut opts = DiffOptions::new();
    opts.pathspec(path);
    apply_diff_settings(&mut opts);

    let diff = repo
        .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    build_file_diff(path, None, &diff)
}
