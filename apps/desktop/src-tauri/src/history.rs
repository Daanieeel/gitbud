use git2::Repository;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitEntry {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub parent_ids: Vec<String>,
    /// True if this commit hasn't reached the branch's `origin` upstream yet — reachable from
    /// HEAD but not from `origin/<branch>` (or, if the branch has no upstream at all, simply
    /// every commit reachable from HEAD, since none of them are on any remote).
    pub unpushed: bool,
    /// This commit's lane in the graph column (0-indexed, stable left-to-right).
    pub lane: usize,
    /// Lanes this commit's edges connect down to (one per parent, same order as `parent_ids`).
    pub parent_lanes: Vec<usize>,
    /// All lanes still "live" (waiting for a future commit) immediately after this row —
    /// lets the frontend draw pass-through vertical lines for lanes this commit doesn't touch.
    pub active_lanes: Vec<usize>,
}

/// Assigns a lane to each commit (already in topo+time order, newest first) so the frontend
/// can render a `git log --graph`-style lane column. This is a standard greedy lane-tracking
/// algorithm: each lane "waits" for a specific oid to appear next; a commit reuses whichever
/// lane was waiting for it (or takes a freed lane, or opens a new one), then hands its own
/// lane off to its first parent and opens/reuses lanes for any additional (merge) parents.
fn assign_lanes(commits: &mut [CommitEntry]) {
    let mut lanes: Vec<Option<String>> = Vec::new();

    for commit in commits.iter_mut() {
        let lane = match lanes
            .iter()
            .position(|l| l.as_deref() == Some(commit.oid.as_str()))
        {
            Some(i) => i,
            None => match lanes.iter().position(|l| l.is_none()) {
                Some(i) => i,
                None => {
                    lanes.push(None);
                    lanes.len() - 1
                }
            },
        };

        let mut parent_lanes = Vec::with_capacity(commit.parent_ids.len());
        for (i, parent) in commit.parent_ids.iter().enumerate() {
            if i == 0 {
                lanes[lane] = Some(parent.clone());
                parent_lanes.push(lane);
                continue;
            }
            let existing = lanes
                .iter()
                .position(|l| l.as_deref() == Some(parent.as_str()));
            let parent_lane = match existing {
                Some(i) => i,
                None => match lanes.iter().position(|l| l.is_none()) {
                    Some(i) => {
                        lanes[i] = Some(parent.clone());
                        i
                    }
                    None => {
                        lanes.push(Some(parent.clone()));
                        lanes.len() - 1
                    }
                },
            };
            parent_lanes.push(parent_lane);
        }
        if commit.parent_ids.is_empty() {
            lanes[lane] = None;
        }

        commit.lane = lane;
        commit.parent_lanes = parent_lanes;
        commit.active_lanes = lanes
            .iter()
            .enumerate()
            .filter_map(|(i, l)| l.is_some().then_some(i))
            .collect();
    }
}

/// Fetches one page of history with graph lane info. Lane assignment depends on everything
/// seen so far in the walk, so (correctly, if a bit wastefully for very deep pagination) this
/// walks from the top of history through `skip + limit` commits each call and returns only
/// the requested page — simplest way to stay stateless across paginated Tauri calls while
/// keeping lanes consistent from page to page.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitSearchResult {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
    pub author_name: String,
    pub timestamp: i64,
}

/// Searches the full commit history (not just what's paginated into the frontend's `commits`
/// list) for a case-insensitive substring match against summary, author name, or full/short
/// oid — backs the command palette's commit search.
pub fn search_commits(
    repo_path: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<CommitSearchResult>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.message().to_string())?;
    revwalk.push_head().map_err(|e| e.message().to_string())?;
    revwalk
        .set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)
        .map_err(|e| e.message().to_string())?;

    let needle = query.to_lowercase();
    let mut results = Vec::with_capacity(limit);

    for oid in revwalk {
        if results.len() >= limit {
            break;
        }
        let oid = oid.map_err(|e| e.message().to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
        let oid_str = oid.to_string();
        let summary = commit.summary().unwrap_or("").to_string();
        let author_name = commit.author().name().unwrap_or("").to_string();

        let matches = summary.to_lowercase().contains(&needle)
            || author_name.to_lowercase().contains(&needle)
            || oid_str.starts_with(&needle);
        if matches {
            results.push(CommitSearchResult {
                short_oid: oid_str.chars().take(7).collect(),
                oid: oid_str,
                summary,
                author_name,
                timestamp: commit.time().seconds(),
            });
        }
    }
    Ok(results)
}

/// Lists commits reachable from `head` but not from `base` (`git log base..head`) — the same
/// two-dot comparison GitHub's PR "Commits" tab shows, newest first. No lane/graph info since
/// this is a flat linear list, not the full-history graph view.
pub fn get_branch_commits(
    repo_path: &str,
    base: &str,
    head: &str,
) -> Result<Vec<CommitSearchResult>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
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

    let mut revwalk = repo.revwalk().map_err(|e| e.message().to_string())?;
    revwalk
        .push(head_oid)
        .map_err(|e| e.message().to_string())?;
    revwalk
        .hide(base_oid)
        .map_err(|e| e.message().to_string())?;
    revwalk
        .set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)
        .map_err(|e| e.message().to_string())?;

    let mut results = Vec::new();
    for oid in revwalk {
        let oid = oid.map_err(|e| e.message().to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
        let oid_str = oid.to_string();
        results.push(CommitSearchResult {
            short_oid: oid_str.chars().take(7).collect(),
            oid: oid_str,
            summary: commit.summary().unwrap_or("").to_string(),
            author_name: commit.author().name().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
        });
    }
    Ok(results)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitAuthor {
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitDetail {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
    pub description: String,
    /// The commit's own author, followed by any `Co-authored-by:` trailers found in the
    /// message body — deduplicated by email against the primary author and each other.
    pub authors: Vec<CommitAuthor>,
    pub timestamp: i64,
    pub insertions: usize,
    pub deletions: usize,
}

/// Fetches everything the commit-detail header needs beyond what's already in `CommitEntry`:
/// the full message split into summary/description, all authors (including co-authors parsed
/// from the message trailers), and the commit's diffstat against its first parent.
pub fn get_commit_detail(repo_path: &str, oid: &str) -> Result<CommitDetail, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let commit_oid = git2::Oid::from_str(oid).map_err(|e| e.message().to_string())?;
    let commit = repo
        .find_commit(commit_oid)
        .map_err(|e| e.message().to_string())?;

    let summary = commit.summary().unwrap_or("").to_string();
    let message = commit.message().unwrap_or("").to_string();
    let description = message
        .strip_prefix(&summary)
        .unwrap_or("")
        .trim_start_matches(['\n', '\r'])
        .trim_end()
        .to_string();

    let author = commit.author();
    let mut authors = vec![CommitAuthor {
        name: author.name().unwrap_or("").to_string(),
        email: author.email().unwrap_or("").to_string(),
    }];
    const COAUTHOR_PREFIX: &str = "co-authored-by:";
    for line in description.lines() {
        let trimmed = line.trim();
        if !trimmed.to_lowercase().starts_with(COAUTHOR_PREFIX) {
            continue;
        }
        let rest = trimmed[COAUTHOR_PREFIX.len()..].trim();
        let Some((name, email)) = rest.rsplit_once('<') else {
            continue;
        };
        let name = name.trim().to_string();
        let email = email.trim_end_matches('>').trim().to_string();
        if !authors.iter().any(|a| a.email.eq_ignore_ascii_case(&email)) {
            authors.push(CommitAuthor { name, email });
        }
    }

    let tree = commit.tree().map_err(|e| e.message().to_string())?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(|e| e.message().to_string())?;
    let stats = diff.stats().map_err(|e| e.message().to_string())?;

    Ok(CommitDetail {
        oid: commit_oid.to_string(),
        short_oid: commit_oid.to_string().chars().take(7).collect(),
        summary,
        description,
        authors,
        timestamp: commit.time().seconds(),
        insertions: stats.insertions(),
        deletions: stats.deletions(),
    })
}

/// Commits reachable from HEAD but not from its `origin` upstream (or, with no upstream at
/// all, every commit reachable from HEAD) — the same "unpushed" set `get_ahead_behind` counts,
/// computed here as an actual oid set instead of just a count.
fn unpushed_oids(repo: &Repository) -> std::collections::HashSet<git2::Oid> {
    (|| -> Result<_, git2::Error> {
        let head = repo.head()?;
        let head_oid = head
            .target()
            .ok_or_else(|| git2::Error::from_str("HEAD has no target"))?;
        let branch_name = head
            .shorthand()
            .ok_or_else(|| git2::Error::from_str("HEAD has no shorthand"))?;
        let upstream_ref = format!("refs/remotes/origin/{branch_name}");

        let mut walk = repo.revwalk()?;
        walk.push(head_oid)?;
        if let Ok(upstream_oid) = repo.refname_to_id(&upstream_ref) {
            walk.hide(upstream_oid)?;
        }
        walk.collect::<Result<std::collections::HashSet<_>, _>>()
    })()
    .unwrap_or_default()
}

pub fn get_log(repo_path: &str, limit: usize, skip: usize) -> Result<Vec<CommitEntry>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let unpushed = unpushed_oids(&repo);

    let mut revwalk = repo.revwalk().map_err(|e| e.message().to_string())?;
    revwalk.push_head().map_err(|e| e.message().to_string())?;
    revwalk
        .set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)
        .map_err(|e| e.message().to_string())?;

    let mut entries = Vec::with_capacity(skip + limit);
    for oid in revwalk.take(skip + limit) {
        let oid = oid.map_err(|e| e.message().to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
        let author = commit.author();
        entries.push(CommitEntry {
            oid: oid.to_string(),
            short_oid: oid.to_string().chars().take(7).collect(),
            summary: commit.summary().unwrap_or("").to_string(),
            author_name: author.name().unwrap_or("").to_string(),
            author_email: author.email().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
            parent_ids: commit.parent_ids().map(|id| id.to_string()).collect(),
            unpushed: unpushed.contains(&oid),
            lane: 0,
            parent_lanes: Vec::new(),
            active_lanes: Vec::new(),
        });
    }

    assign_lanes(&mut entries);
    let page = entries.into_iter().skip(skip).take(limit).collect();
    Ok(page)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_log_of_real_repo() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let repo_root = std::path::Path::new(manifest_dir)
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .to_string_lossy()
            .to_string();

        let entries = get_log(&repo_root, 5, 0).expect("log should succeed");
        assert!(!entries.is_empty());
        assert!(entries[0].short_oid.len() == 7);
    }

    #[test]
    fn flags_commits_ahead_of_the_pushed_upstream_as_unpushed() {
        let scratch = ScratchRepo::new("unpushed");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("a.txt"), "a\n").unwrap();
        crate::repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        let pushed_oid = crate::repo::commit(&repo_path, "pushed", "").unwrap();

        // Simulate this commit already being on origin without any actual network access —
        // just point a remote-tracking ref at it directly.
        let repo = Repository::open(&repo_path).unwrap();
        let branch_name = repo.head().unwrap().shorthand().unwrap().to_string();
        repo.reference(
            &format!("refs/remotes/origin/{branch_name}"),
            git2::Oid::from_str(&pushed_oid).unwrap(),
            true,
            "test setup",
        )
        .unwrap();

        std::fs::write(scratch.path.join("b.txt"), "b\n").unwrap();
        crate::repo::stage_paths(&repo_path, &["b.txt".to_string()]).unwrap();
        let unpushed_oid = crate::repo::commit(&repo_path, "not yet pushed", "").unwrap();

        let entries = get_log(&repo_path, 10, 0).unwrap();
        let pushed_entry = entries.iter().find(|e| e.oid == pushed_oid).unwrap();
        let unpushed_entry = entries.iter().find(|e| e.oid == unpushed_oid).unwrap();
        assert!(!pushed_entry.unpushed);
        assert!(unpushed_entry.unpushed);
    }

    struct ScratchRepo {
        path: std::path::PathBuf,
    }

    impl ScratchRepo {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "gitbud-test-history-{name}-{}",
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
    fn commit_detail_splits_message_and_parses_coauthors_and_stats() {
        let scratch = ScratchRepo::new("detail");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("a.txt"), "one\ntwo\n").unwrap();
        crate::repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        let base_oid = crate::repo::commit(&repo_path, "base", "").unwrap();
        let base_detail = get_commit_detail(&repo_path, &base_oid).unwrap();
        assert_eq!(base_detail.description, "");
        assert_eq!(base_detail.authors.len(), 1);
        assert_eq!(base_detail.insertions, 2);
        assert_eq!(base_detail.deletions, 0);

        std::fs::write(scratch.path.join("a.txt"), "one\nthree\n").unwrap();
        crate::repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        let oid = crate::repo::commit(
            &repo_path,
            "fix the thing",
            "Longer explanation.\n\nCo-authored-by: Helper <helper@example.com>",
        )
        .unwrap();

        let detail = get_commit_detail(&repo_path, &oid).unwrap();
        assert_eq!(detail.summary, "fix the thing");
        assert_eq!(
            detail.description,
            "Longer explanation.\n\nCo-authored-by: Helper <helper@example.com>"
        );
        assert_eq!(detail.authors.len(), 2);
        assert_eq!(detail.authors[0].email, "test@example.com");
        assert_eq!(detail.authors[1].name, "Helper");
        assert_eq!(detail.authors[1].email, "helper@example.com");
        assert_eq!(detail.insertions, 1);
        assert_eq!(detail.deletions, 1);
    }

    #[test]
    fn merge_commit_gets_a_second_parent_lane() {
        let scratch = ScratchRepo::new("graph");
        let repo_path = scratch.path_str();

        std::fs::write(scratch.path.join("a.txt"), "a\n").unwrap();
        crate::repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        crate::repo::commit(&repo_path, "base", "").unwrap();
        let base_branch = crate::repo::get_current_branch(&repo_path).unwrap();

        crate::repo::create_branch(&repo_path, "feature", true).unwrap();
        std::fs::write(scratch.path.join("b.txt"), "b\n").unwrap();
        crate::repo::stage_paths(&repo_path, &["b.txt".to_string()]).unwrap();
        crate::repo::commit(&repo_path, "feature work", "").unwrap();

        crate::repo::checkout_branch(&repo_path, &base_branch).unwrap();
        std::fs::write(scratch.path.join("c.txt"), "c\n").unwrap();
        crate::repo::stage_paths(&repo_path, &["c.txt".to_string()]).unwrap();
        crate::repo::commit(&repo_path, "main work", "").unwrap();

        crate::repo::merge_branch(&repo_path, "feature").unwrap();

        let log = get_log(&repo_path, 10, 0).unwrap();
        let merge_commit = &log[0];
        assert_eq!(merge_commit.parent_ids.len(), 2);
        assert_eq!(merge_commit.parent_lanes.len(), 2);
        // The two parent lanes must differ — that's the whole point of a merge fork in the graph.
        assert_ne!(merge_commit.parent_lanes[0], merge_commit.parent_lanes[1]);
    }
}
