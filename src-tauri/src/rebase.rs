use git2::{Oid, Repository, ResetType};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebaseTodoItem {
    pub oid: String,
    /// "pick" | "squash" | "drop"
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebaseResult {
    pub success: bool,
    pub conflicted_oid: Option<String>,
    pub conflicted_summary: Option<String>,
}

/// Replays `todo` (in the given order) onto `base_oid`, then fast-forwards the current
/// branch to the result. Supports reordering, dropping, and squashing (each "squash" item
/// merges into the commit produced by the item before it).
///
/// This is deliberately *not* a full `git rebase -i`: if any pick conflicts, the whole
/// operation is rolled back to the original HEAD and reported as failed, rather than leaving
/// a half-applied rebase paused mid-sequence for the user to resolve and "continue" later.
/// Real rebase state (`.git/rebase-merge`) is resumable across app restarts; reproducing that
/// safely is a lot of extra surface for what's explicitly a "nice to have" feature — full
/// rollback keeps every outcome either "worked cleanly" or "nothing changed", never a
/// confusing in-between state.
pub fn interactive_rebase(
    repo_path: &str,
    base_oid: &str,
    todo: &[RebaseTodoItem],
) -> Result<RebaseResult, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;

    let head_ref = repo.head().map_err(|e| e.message().to_string())?;
    let branch_ref_name = head_ref.name().ok_or("HEAD has no ref name")?.to_string();
    let original_head_oid = head_ref
        .target()
        .ok_or("HEAD has no direct target")?;

    let base_commit = repo
        .find_commit(Oid::from_str(base_oid).map_err(|e| e.message().to_string())?)
        .map_err(|e| e.message().to_string())?;

    let rollback = |repo: &Repository| -> Result<(), String> {
        let original = repo.find_commit(original_head_oid).map_err(|e| e.message().to_string())?;
        repo.reset(original.as_object(), ResetType::Hard, None)
            .map_err(|e| e.message().to_string())?;
        repo.cleanup_state().map_err(|e| e.message().to_string())?;
        Ok(())
    };

    repo.reset(base_commit.as_object(), ResetType::Hard, None)
        .map_err(|e| e.message().to_string())?;

    let signature = repo.signature().map_err(|e| e.message().to_string())?;
    let mut previous_commit_for_squash: Option<git2::Oid> = None;

    for item in todo {
        if item.action == "drop" {
            continue;
        }

        let commit = repo
            .find_commit(Oid::from_str(&item.oid).map_err(|e| e.message().to_string())?)
            .map_err(|e| e.message().to_string())?;

        repo.cherrypick(&commit, None).map_err(|e| {
            let _ = rollback(&repo);
            e.message().to_string()
        })?;

        let mut index = repo.index().map_err(|e| e.message().to_string())?;
        if index.has_conflicts() {
            let summary = commit.summary().unwrap_or("").to_string();
            rollback(&repo)?;
            return Ok(RebaseResult {
                success: false,
                conflicted_oid: Some(item.oid.clone()),
                conflicted_summary: Some(summary),
            });
        }

        let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
        let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;

        if item.action == "squash" {
            let Some(prev_oid) = previous_commit_for_squash else {
                rollback(&repo)?;
                return Err("cannot squash: no preceding commit to squash into".to_string());
            };
            let prev_commit = repo.find_commit(prev_oid).map_err(|e| e.message().to_string())?;
            let combined_message = format!(
                "{}\n\n{}",
                prev_commit.message().unwrap_or(""),
                commit.message().unwrap_or("")
            );
            let new_oid = prev_commit
                .amend(
                    Some(&branch_ref_name),
                    None,
                    None,
                    None,
                    Some(&combined_message),
                    Some(&tree),
                )
                .map_err(|e| e.message().to_string())?;
            previous_commit_for_squash = Some(new_oid);
        } else {
            let parent = match previous_commit_for_squash {
                Some(oid) => repo.find_commit(oid).map_err(|e| e.message().to_string())?,
                None => base_commit.clone(),
            };
            let new_oid = repo
                .commit(
                    Some(&branch_ref_name),
                    &commit.author(),
                    &signature,
                    commit.message().unwrap_or(""),
                    &tree,
                    &[&parent],
                )
                .map_err(|e| e.message().to_string())?;
            previous_commit_for_squash = Some(new_oid);
        }

        repo.cleanup_state().map_err(|e| e.message().to_string())?;
    }

    // No picks at all (e.g. every item dropped) — branch ref still needs to land on base.
    if previous_commit_for_squash.is_none() {
        repo.reference(&branch_ref_name, base_commit.id(), true, "interactive rebase: all dropped")
            .map_err(|e| e.message().to_string())?;
    }

    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .map_err(|e| e.message().to_string())?;

    Ok(RebaseResult { success: true, conflicted_oid: None, conflicted_summary: None })
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
                "gitbud-test-rebase-{name}-{}",
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

        fn write_and_commit(&self, file: &str, contents: &str, message: &str) -> String {
            std::fs::write(self.path.join(file), contents).unwrap();
            repo::stage_paths(&self.path_str(), &[file.to_string()]).unwrap();
            repo::commit(&self.path_str(), message, "").unwrap()
        }
    }

    impl Drop for ScratchRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn drops_a_commit_from_the_sequence() {
        let scratch = ScratchRepo::new("drop");
        let repo_path = scratch.path_str();
        let base = scratch.write_and_commit("base.txt", "base\n", "base");
        let keep = scratch.write_and_commit("a.txt", "a\n", "add a");
        let drop_me = scratch.write_and_commit("b.txt", "b\n", "add b");

        let todo = vec![
            RebaseTodoItem { oid: keep.clone(), action: "pick".to_string() },
            RebaseTodoItem { oid: drop_me, action: "drop".to_string() },
        ];
        let result = interactive_rebase(&repo_path, &base, &todo).unwrap();
        assert!(result.success);
        assert!(scratch.path.join("a.txt").exists());
        assert!(!scratch.path.join("b.txt").exists());

        let log = crate::history::get_log(&repo_path, 10, 0).unwrap();
        assert_eq!(log.len(), 2); // base + kept commit
    }

    #[test]
    fn reorders_two_independent_commits() {
        let scratch = ScratchRepo::new("reorder");
        let repo_path = scratch.path_str();
        let base = scratch.write_and_commit("base.txt", "base\n", "base");
        let first = scratch.write_and_commit("a.txt", "a\n", "add a");
        let second = scratch.write_and_commit("b.txt", "b\n", "add b");

        // Reverse the order: "add b" should now come before "add a" in history.
        let todo = vec![
            RebaseTodoItem { oid: second, action: "pick".to_string() },
            RebaseTodoItem { oid: first, action: "pick".to_string() },
        ];
        let result = interactive_rebase(&repo_path, &base, &todo).unwrap();
        assert!(result.success);

        let log = crate::history::get_log(&repo_path, 10, 0).unwrap();
        assert_eq!(log[0].summary, "add a"); // most recent = last picked
        assert_eq!(log[1].summary, "add b");
    }

    #[test]
    fn squashes_two_commits_into_one() {
        let scratch = ScratchRepo::new("squash");
        let repo_path = scratch.path_str();
        let base = scratch.write_and_commit("base.txt", "base\n", "base");
        let first = scratch.write_and_commit("a.txt", "a\n", "add a");
        let second = scratch.write_and_commit("b.txt", "b\n", "fixup a");

        let todo = vec![
            RebaseTodoItem { oid: first, action: "pick".to_string() },
            RebaseTodoItem { oid: second, action: "squash".to_string() },
        ];
        let result = interactive_rebase(&repo_path, &base, &todo).unwrap();
        assert!(result.success);

        let log = crate::history::get_log(&repo_path, 10, 0).unwrap();
        assert_eq!(log.len(), 2); // base + one squashed commit
        assert!(log[0].summary.contains("add a"));
        assert!(scratch.path.join("a.txt").exists());
        assert!(scratch.path.join("b.txt").exists());
    }

    #[test]
    fn conflicting_pick_rolls_back_completely() {
        let scratch = ScratchRepo::new("conflict");
        let repo_path = scratch.path_str();
        // base: three lines. Commit A changes line 2. Commit B (child of A) changes line 2
        // again. Picking B directly onto `base` (skipping A) conflicts, because B's diff
        // expects A's content as context, not base's original line 2.
        let base = scratch.write_and_commit("a.txt", "line1\nline2\nline3\n", "base");
        scratch.write_and_commit("a.txt", "line1\nCHANGED_A\nline3\n", "change by A");
        let conflicting = scratch.write_and_commit("a.txt", "line1\nCHANGED_B\nline3\n", "change by B");

        let todo = vec![RebaseTodoItem { oid: conflicting.clone(), action: "pick".to_string() }];
        let result = interactive_rebase(&repo_path, &base, &todo).unwrap();

        assert!(!result.success);
        assert_eq!(result.conflicted_oid, Some(conflicting));

        // Full rollback: HEAD (and its content) must be exactly what it was before the
        // attempt — never a half-applied state.
        let contents = std::fs::read_to_string(scratch.path.join("a.txt")).unwrap();
        assert_eq!(contents, "line1\nCHANGED_B\nline3\n");
        let status = repo::get_status(&repo_path).unwrap();
        assert!(status.files.is_empty());
    }
}
