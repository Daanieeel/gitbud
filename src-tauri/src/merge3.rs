use crate::diff::{DiffHunk, DiffLine, LineKind};
use git2::{Blob, Repository};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictSide {
    pub exists: bool,
    /// This side's hunks vs. the common ancestor ("base").
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictSides {
    pub base_exists: bool,
    pub base_text: String,
    pub ours: ConflictSide,
    pub theirs: ConflictSide,
}

fn diff_against_base(
    repo: &Repository,
    base: Option<&Blob>,
    side: Option<&Blob>,
    path: &str,
) -> Result<Vec<DiffHunk>, String> {
    let hunks: RefCell<Vec<DiffHunk>> = RefCell::new(Vec::new());

    repo.diff_blobs(
        base,
        Some(path),
        side,
        Some(path),
        None,
        None,
        None,
        Some(&mut |_delta, hunk| {
            hunks.borrow_mut().push(DiffHunk {
                header: String::from_utf8_lossy(hunk.header()).trim_end().to_string(),
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
            let content = String::from_utf8_lossy(line.content()).trim_end_matches('\n').to_string();
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
    crate::diff::add_intraline_highlights(&mut hunks);
    Ok(hunks)
}

/// Reads the base/ours/theirs blobs for a conflicted path straight out of the index's
/// conflict stages, and diffs ours/theirs against base — the raw material for a real 3-way
/// merge view (as opposed to the flat conflict-marker text git writes to the working tree).
pub fn get_conflict_sides(repo_path: &str, path: &str) -> Result<ConflictSides, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let index = repo.index().map_err(|e| e.message().to_string())?;

    let mut base_blob = None;
    let mut ours_blob = None;
    let mut theirs_blob = None;

    for conflict in index.conflicts().map_err(|e| e.message().to_string())? {
        let conflict = conflict.map_err(|e| e.message().to_string())?;
        let matches_path = |entry: &Option<git2::IndexEntry>| {
            entry.as_ref().map(|e| e.path == path.as_bytes()).unwrap_or(false)
        };
        if matches_path(&conflict.ancestor) || matches_path(&conflict.our) || matches_path(&conflict.their) {
            if let Some(a) = &conflict.ancestor {
                base_blob = repo.find_blob(a.id).ok();
            }
            if let Some(o) = &conflict.our {
                ours_blob = repo.find_blob(o.id).ok();
            }
            if let Some(t) = &conflict.their {
                theirs_blob = repo.find_blob(t.id).ok();
            }
            break;
        }
    }

    let base_text = base_blob
        .as_ref()
        .map(|b| String::from_utf8_lossy(b.content()).to_string())
        .unwrap_or_default();
    let ours_hunks = diff_against_base(&repo, base_blob.as_ref(), ours_blob.as_ref(), path)?;
    let theirs_hunks = diff_against_base(&repo, base_blob.as_ref(), theirs_blob.as_ref(), path)?;

    Ok(ConflictSides {
        base_exists: base_blob.is_some(),
        base_text,
        ours: ConflictSide { exists: ours_blob.is_some(), hunks: ours_hunks },
        theirs: ConflictSide { exists: theirs_blob.is_some(), hunks: theirs_hunks },
    })
}

/// Writes fully-resolved content for a conflicted path and stages it — used once the user has
/// picked a side for every conflicting block in the 3-way merge view.
pub fn resolve_conflict_with_content(repo_path: &str, path: &str, content: &str) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let target_path = std::path::Path::new(path);

    let full_path = std::path::Path::new(repo_path).join(path);
    std::fs::write(&full_path, content).map_err(|e| e.to_string())?;

    index.remove_path(target_path).map_err(|e| e.message().to_string())?;
    index.add_path(target_path).map_err(|e| e.message().to_string())?;
    index.write().map_err(|e| e.message().to_string())
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
                "gitbud-test-merge3-{name}-{}",
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
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

        fn write_and_commit(&self, file: &str, contents: &str, message: &str) {
            std::fs::write(self.path.join(file), contents).unwrap();
            repo::stage_paths(&self.path_str(), &[file.to_string()]).unwrap();
            repo::commit(&self.path_str(), message, "").unwrap();
        }
    }

    impl Drop for ScratchRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn three_way_merge_picks_resolve_a_real_conflict() {
        let scratch = ScratchRepo::new("conflict");
        let repo_path = scratch.path_str();
        scratch.write_and_commit("a.txt", "one\ntwo\nthree\n", "base");
        let main_branch = repo::get_current_branch(&repo_path).unwrap();

        repo::create_branch(&repo_path, "feature", true).unwrap();
        scratch.write_and_commit("a.txt", "one\nTHEIRS\nthree\n", "theirs change");

        repo::checkout_branch(&repo_path, &main_branch).unwrap();
        scratch.write_and_commit("a.txt", "one\nOURS\nthree\n", "ours change");

        let result = repo::merge_branch(&repo_path, "feature").unwrap();
        assert!(result.conflicted);

        let sides = get_conflict_sides(&repo_path, "a.txt").unwrap();
        assert!(sides.base_exists);
        assert!(sides.ours.exists);
        assert!(sides.theirs.exists);

        // Both sides changed the same base line -> a genuine conflict (would be one merged
        // block once run through the frontend's overlap-merge in src/lib/merge3.ts).
        assert!(!sides.ours.hunks.is_empty());
        assert!(!sides.theirs.hunks.is_empty());

        resolve_conflict_with_content(&repo_path, "a.txt", "one\nOURS\nthree\n").unwrap();
        let contents = std::fs::read_to_string(scratch.path.join("a.txt")).unwrap();
        assert_eq!(contents, "one\nOURS\nthree\n");
        assert!(!repo::get_status(&repo_path).unwrap().files.iter().any(|f| f.path == "a.txt" && !f.staged));
    }
}
