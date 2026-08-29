use r2d2::{Pool, PooledConnection};
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use rusqlite::OptionalExtension;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

use crate::diff::PrFileEntry;
use crate::github::api::{
    CheckRun, IssueComment, PullRequest, PullRequestCommit, Review, ReviewComment,
};

/// Rows older than this are opportunistically pruned on each write, so a long-lived app session
/// doesn't grow this file forever on disk. Doesn't apply to `avatars` — those are kept
/// indefinitely and only removed by explicit user action (see `clear_avatars`).
const MAX_AGE_SECS: i64 = 30 * 24 * 60 * 60;

fn config_dir() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or("could not resolve config directory")?;
    let dir = base.join("gitbud");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

/// Shared across every call in the process: `SqliteConnectionManager` opens its own `Connection`
/// per pool checkout, but pooling still matters here — it serializes concurrent access (parallel
/// `spawn_blocking` calls from different Tauri commands writing to the same file) behind WAL mode
/// and a busy timeout instead of each call racing a brand-new connection with SQLite's default
/// (zero) busy timeout, which under contention just fails outright with `SQLITE_BUSY`.
fn pool() -> Result<&'static Pool<SqliteConnectionManager>, String> {
    static POOL: OnceLock<Result<Pool<SqliteConnectionManager>, String>> = OnceLock::new();
    POOL.get_or_init(|| {
        let path = config_dir()?.join("pr_cache.sqlite");
        let manager = SqliteConnectionManager::file(path).with_init(|conn| {
            conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
        });
        let pool = Pool::new(manager).map_err(|e| e.to_string())?;
        pool.get()
            .map_err(|e| e.to_string())?
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS pr_list (
                    repo_key TEXT NOT NULL, number INTEGER NOT NULL,
                    data TEXT NOT NULL, synced_at INTEGER NOT NULL,
                    PRIMARY KEY (repo_key, number)
                );
                CREATE TABLE IF NOT EXISTS pr_files (
                    repo_key TEXT NOT NULL, number INTEGER NOT NULL,
                    head_sha TEXT NOT NULL, files_json TEXT NOT NULL, synced_at INTEGER NOT NULL,
                    PRIMARY KEY (repo_key, number)
                );
                CREATE TABLE IF NOT EXISTS pr_comments (
                    repo_key TEXT NOT NULL, number INTEGER NOT NULL,
                    comments_json TEXT NOT NULL, synced_at INTEGER NOT NULL,
                    PRIMARY KEY (repo_key, number)
                );
                CREATE TABLE IF NOT EXISTS check_runs (
                    repo_key TEXT NOT NULL, sha TEXT NOT NULL,
                    data TEXT NOT NULL, synced_at INTEGER NOT NULL,
                    PRIMARY KEY (repo_key, sha)
                );
                CREATE TABLE IF NOT EXISTS avatars (
                    url TEXT PRIMARY KEY,
                    data_uri TEXT NOT NULL,
                    cached_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS pr_commits (
                    repo_key TEXT NOT NULL, number INTEGER NOT NULL,
                    head_sha TEXT NOT NULL, commits_json TEXT NOT NULL, synced_at INTEGER NOT NULL,
                    PRIMARY KEY (repo_key, number)
                );
                CREATE TABLE IF NOT EXISTS pr_issue_comments (
                    repo_key TEXT NOT NULL, number INTEGER NOT NULL,
                    comments_json TEXT NOT NULL, synced_at INTEGER NOT NULL,
                    PRIMARY KEY (repo_key, number)
                );
                CREATE TABLE IF NOT EXISTS pr_reviews (
                    repo_key TEXT NOT NULL, number INTEGER NOT NULL,
                    reviews_json TEXT NOT NULL, synced_at INTEGER NOT NULL,
                    PRIMARY KEY (repo_key, number)
                );
                CREATE TABLE IF NOT EXISTS pr_archived (
                    repo_key TEXT NOT NULL, number INTEGER NOT NULL,
                    archived_at INTEGER NOT NULL,
                    PRIMARY KEY (repo_key, number)
                );
                ",
            )
            .map_err(|e| e.to_string())?;
        Ok(pool)
    })
    .as_ref()
    .map_err(|e| e.clone())
}

fn conn() -> Result<PooledConnection<SqliteConnectionManager>, String> {
    pool()?.get().map_err(|e| e.to_string())
}

fn prune(conn: &rusqlite::Connection, table: &str, repo_key: &str) {
    let cutoff = now() - MAX_AGE_SECS;
    let _ = conn.execute(
        &format!("DELETE FROM {table} WHERE repo_key = ?1 AND synced_at < ?2"),
        params![repo_key, cutoff],
    );
}

/// Mirrors GitHub's list-PRs `state` semantics (see `list_pull_requests`'s doc comment):
/// "closed" includes merged PRs, not just closed-and-unmerged ones.
fn matches_state(pr: &PullRequest, state: &str) -> bool {
    match state {
        "open" => pr.state == "open",
        "closed" => pr.state == "closed",
        _ => true,
    }
}

pub fn get_cached_pr_list(repo_key: &str, state: &str) -> Result<Vec<PullRequest>, String> {
    let conn = conn()?;
    // ORDER BY number DESC to match GitHub's default list-PRs order (newest first) — otherwise
    // this mirrors sqlite's arbitrary row order until the live fetch overwrites it, causing PRs
    // to visibly reorder on screen a moment after paint.
    let mut stmt = conn
        .prepare("SELECT data FROM pr_list WHERE repo_key = ?1 ORDER BY number DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![repo_key], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let json = row.map_err(|e| e.to_string())?;
        if let Ok(pr) = serde_json::from_str::<PullRequest>(&json) {
            if matches_state(&pr, state) {
                out.push(pr);
            }
        }
    }
    Ok(out)
}

pub fn upsert_pr_list(repo_key: &str, prs: &[PullRequest]) -> Result<(), String> {
    let mut conn = conn()?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let synced_at = now();
    for pr in prs {
        let data = serde_json::to_string(pr).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO pr_list (repo_key, number, data, synced_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(repo_key, number) DO UPDATE SET data = excluded.data, synced_at = excluded.synced_at",
            params![repo_key, pr.number as i64, data, synced_at],
        )
        .map_err(|e| e.to_string())?;
    }
    prune(&tx, "pr_list", repo_key);
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Write-through for a single PR's metadata, e.g. after a merge flips `state`/`merged` without
/// waiting for the next full list refetch.
pub fn upsert_pr(repo_key: &str, pr: &PullRequest) -> Result<(), String> {
    upsert_pr_list(repo_key, std::slice::from_ref(pr))
}

/// `None` when there's no cached copy or the cached copy's `head_sha` no longer matches; either
/// way, the caller should fetch fresh from GitHub. A cache hit means the diff is guaranteed
/// unchanged (a PR's file diffs are immutable for a given commit), so callers can skip both the
/// network request and re-parsing every changed line.
pub fn get_cached_files(
    repo_key: &str,
    number: u64,
    head_sha: &str,
) -> Result<Option<Vec<PrFileEntry>>, String> {
    let conn = conn()?;
    let result: Option<(String, String)> = conn
        .query_row(
            "SELECT head_sha, files_json FROM pr_files WHERE repo_key = ?1 AND number = ?2",
            params![repo_key, number as i64],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match result {
        Some((cached_sha, files_json)) if cached_sha == head_sha => {
            serde_json::from_str(&files_json).map_err(|e| e.to_string())
        }
        _ => Ok(None),
    }
}

/// Whatever's cached for this PR's files, regardless of whether `head_sha` is still current,
/// for instant-paint seeding while a live (freshness-checked) fetch is in flight, not for
/// deciding whether that fetch is needed.
pub fn get_any_cached_files(
    repo_key: &str,
    number: u64,
) -> Result<Option<Vec<PrFileEntry>>, String> {
    let conn = conn()?;
    let files_json: Option<String> = conn
        .query_row(
            "SELECT files_json FROM pr_files WHERE repo_key = ?1 AND number = ?2",
            params![repo_key, number as i64],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    files_json
        .map(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
        .transpose()
}

pub fn upsert_files(
    repo_key: &str,
    number: u64,
    head_sha: &str,
    files: &[PrFileEntry],
) -> Result<(), String> {
    let conn = conn()?;
    let files_json = serde_json::to_string(files).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO pr_files (repo_key, number, head_sha, files_json, synced_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(repo_key, number) DO UPDATE SET head_sha = excluded.head_sha, files_json = excluded.files_json, synced_at = excluded.synced_at",
        params![repo_key, number as i64, head_sha, files_json, now()],
    )
    .map_err(|e| e.to_string())?;
    prune(&conn, "pr_files", repo_key);
    Ok(())
}

pub fn get_cached_comments(
    repo_key: &str,
    number: u64,
) -> Result<Option<Vec<ReviewComment>>, String> {
    let conn = conn()?;
    let result: Option<String> = conn
        .query_row(
            "SELECT comments_json FROM pr_comments WHERE repo_key = ?1 AND number = ?2",
            params![repo_key, number as i64],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    result
        .map(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
        .transpose()
}

pub fn upsert_comments(
    repo_key: &str,
    number: u64,
    comments: &[ReviewComment],
) -> Result<(), String> {
    let conn = conn()?;
    let comments_json = serde_json::to_string(comments).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO pr_comments (repo_key, number, comments_json, synced_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(repo_key, number) DO UPDATE SET comments_json = excluded.comments_json, synced_at = excluded.synced_at",
        params![repo_key, number as i64, comments_json, now()],
    )
    .map_err(|e| e.to_string())?;
    prune(&conn, "pr_comments", repo_key);
    Ok(())
}

/// `None` when there's no cached copy or the cached copy's `head_sha` no longer matches —
/// mirrors `get_cached_files`'s freshness-checked-by-sha convention, since a PR's commit list is
/// likewise immutable for a given head commit.
pub fn get_cached_commits(
    repo_key: &str,
    number: u64,
    head_sha: &str,
) -> Result<Option<Vec<PullRequestCommit>>, String> {
    let conn = conn()?;
    let result: Option<(String, String)> = conn
        .query_row(
            "SELECT head_sha, commits_json FROM pr_commits WHERE repo_key = ?1 AND number = ?2",
            params![repo_key, number as i64],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match result {
        Some((cached_sha, commits_json)) if cached_sha == head_sha => {
            serde_json::from_str(&commits_json).map_err(|e| e.to_string())
        }
        _ => Ok(None),
    }
}

/// Whatever's cached for this PR's commits, regardless of whether `head_sha` is still current —
/// mirrors `get_any_cached_files`, for instant-paint seeding (and the offline fallback) while a
/// live, freshness-checked fetch is in flight or unreachable.
pub fn get_any_cached_commits(
    repo_key: &str,
    number: u64,
) -> Result<Option<Vec<PullRequestCommit>>, String> {
    let conn = conn()?;
    let commits_json: Option<String> = conn
        .query_row(
            "SELECT commits_json FROM pr_commits WHERE repo_key = ?1 AND number = ?2",
            params![repo_key, number as i64],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    commits_json
        .map(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
        .transpose()
}

pub fn upsert_commits(
    repo_key: &str,
    number: u64,
    head_sha: &str,
    commits: &[PullRequestCommit],
) -> Result<(), String> {
    let conn = conn()?;
    let commits_json = serde_json::to_string(commits).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO pr_commits (repo_key, number, head_sha, commits_json, synced_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(repo_key, number) DO UPDATE SET head_sha = excluded.head_sha, commits_json = excluded.commits_json, synced_at = excluded.synced_at",
        params![repo_key, number as i64, head_sha, commits_json, now()],
    )
    .map_err(|e| e.to_string())?;
    prune(&conn, "pr_commits", repo_key);
    Ok(())
}

pub fn get_cached_issue_comments(
    repo_key: &str,
    number: u64,
) -> Result<Option<Vec<IssueComment>>, String> {
    let conn = conn()?;
    let result: Option<String> = conn
        .query_row(
            "SELECT comments_json FROM pr_issue_comments WHERE repo_key = ?1 AND number = ?2",
            params![repo_key, number as i64],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    result
        .map(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
        .transpose()
}

pub fn upsert_issue_comments(
    repo_key: &str,
    number: u64,
    comments: &[IssueComment],
) -> Result<(), String> {
    let conn = conn()?;
    let comments_json = serde_json::to_string(comments).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO pr_issue_comments (repo_key, number, comments_json, synced_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(repo_key, number) DO UPDATE SET comments_json = excluded.comments_json, synced_at = excluded.synced_at",
        params![repo_key, number as i64, comments_json, now()],
    )
    .map_err(|e| e.to_string())?;
    prune(&conn, "pr_issue_comments", repo_key);
    Ok(())
}

pub fn get_cached_reviews(repo_key: &str, number: u64) -> Result<Option<Vec<Review>>, String> {
    let conn = conn()?;
    let result: Option<String> = conn
        .query_row(
            "SELECT reviews_json FROM pr_reviews WHERE repo_key = ?1 AND number = ?2",
            params![repo_key, number as i64],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    result
        .map(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
        .transpose()
}

pub fn upsert_reviews(repo_key: &str, number: u64, reviews: &[Review]) -> Result<(), String> {
    let conn = conn()?;
    let reviews_json = serde_json::to_string(reviews).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO pr_reviews (repo_key, number, reviews_json, synced_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(repo_key, number) DO UPDATE SET reviews_json = excluded.reviews_json, synced_at = excluded.synced_at",
        params![repo_key, number as i64, reviews_json, now()],
    )
    .map_err(|e| e.to_string())?;
    prune(&conn, "pr_reviews", repo_key);
    Ok(())
}

pub fn get_cached_check_runs(repo_key: &str, sha: &str) -> Result<Option<Vec<CheckRun>>, String> {
    let conn = conn()?;
    let result: Option<String> = conn
        .query_row(
            "SELECT data FROM check_runs WHERE repo_key = ?1 AND sha = ?2",
            params![repo_key, sha],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    result
        .map(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
        .transpose()
}

pub fn upsert_check_runs(repo_key: &str, sha: &str, runs: &[CheckRun]) -> Result<(), String> {
    let conn = conn()?;
    let data = serde_json::to_string(runs).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO check_runs (repo_key, sha, data, synced_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(repo_key, sha) DO UPDATE SET data = excluded.data, synced_at = excluded.synced_at",
        params![repo_key, sha, data, now()],
    )
    .map_err(|e| e.to_string())?;
    prune(&conn, "check_runs", repo_key);
    Ok(())
}

/// Avatars aren't repo-scoped (a GitHub user's avatar is the same everywhere), so this piggybacks
/// on the same local database as everything else here rather than warranting its own file.
/// Unlike the repo-scoped tables above, rows here are never age-pruned — kept until the user
/// explicitly clears them via `clear_avatars`, since an avatar going stale isn't dangerous the
/// way stale PR/CI data is, and re-fetching every avatar after a routine 30-day prune would just
/// be wasted network traffic on an image that almost never changes.
pub fn get_cached_avatar(url: &str) -> Result<Option<String>, String> {
    let conn = conn()?;
    conn.query_row(
        "SELECT data_uri FROM avatars WHERE url = ?1",
        params![url],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn upsert_avatar(url: &str, data_uri: &str) -> Result<(), String> {
    let conn = conn()?;
    conn.execute(
        "INSERT INTO avatars (url, data_uri, cached_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(url) DO UPDATE SET data_uri = excluded.data_uri, cached_at = excluded.cached_at",
        params![url, data_uri, now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Whether `number` has been archived — a purely local, gitbud-only bookkeeping flag (GitHub has
/// no "archive a pull request" concept at all) for decluttering the open-PR list of ones you're
/// deliberately setting aside. Deliberately not pruned by `prune()` and not touched by
/// `clear_repo_data()` — unlike everything else in this file, this is durable user intent, not a
/// disposable mirror of something GitHub will just hand back again on the next fetch.
pub fn is_pr_archived(repo_key: &str, number: u64) -> Result<bool, String> {
    let conn = conn()?;
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM pr_archived WHERE repo_key = ?1 AND number = ?2",
            params![repo_key, number as i64],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(found.is_some())
}

pub fn set_pr_archived(repo_key: &str, number: u64, archived: bool) -> Result<(), String> {
    let conn = conn()?;
    if archived {
        conn.execute(
            "INSERT INTO pr_archived (repo_key, number, archived_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(repo_key, number) DO NOTHING",
            params![repo_key, number as i64, now()],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "DELETE FROM pr_archived WHERE repo_key = ?1 AND number = ?2",
            params![repo_key, number as i64],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Directory the mirror's SQLite file lives in, for the "Open" button in Settings that reveals
/// it in the OS file manager. Always exists (`config_dir()` creates it), even before anything's
/// actually been cached.
pub fn dir_path() -> Result<String, String> {
    Ok(config_dir()?.to_string_lossy().into_owned())
}

/// Size on disk of the PR/CI mirror (`pr_list`, `pr_files`, `pr_comments`, `check_runs`) and of
/// the avatar cache, measured separately via SQLite's `dbstat` virtual table (both tables share
/// one physical file, so a whole-file `fs::metadata` size can't tell them apart) — `(repo_bytes,
/// avatar_bytes)`, for the two rows in Settings > General > Local data. `(0, 0)` if the database
/// hasn't been created yet.
pub fn cache_sizes() -> Result<(u64, u64), String> {
    let path = config_dir()?.join("pr_cache.sqlite");
    if !path.exists() {
        return Ok((0, 0));
    }
    let conn = conn()?;
    let repo_bytes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(pgsize), 0) FROM dbstat WHERE name IN ('pr_list', 'pr_files', 'pr_comments', 'check_runs', 'pr_commits', 'pr_issue_comments', 'pr_reviews')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let avatar_bytes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(pgsize), 0) FROM dbstat WHERE name = 'avatars'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok((repo_bytes as u64, avatar_bytes as u64))
}

/// Empties the repo-scoped tables (PR lists/files/comments, check runs — NOT avatars, see
/// `clear_avatars`) and reclaims the freed space on disk (`VACUUM` — plain `DELETE`s alone leave
/// SQLite's file size unchanged, since it keeps the freed pages for reuse rather than shrinking
/// the file). For the "Cached repo data" > "Clear" action in Settings.
pub fn clear_repo_data() -> Result<(), String> {
    let conn = conn()?;
    conn.execute_batch(
        "
        DELETE FROM pr_list;
        DELETE FROM pr_files;
        DELETE FROM pr_comments;
        DELETE FROM check_runs;
        DELETE FROM pr_commits;
        DELETE FROM pr_issue_comments;
        DELETE FROM pr_reviews;
        VACUUM;
        ",
    )
    .map_err(|e| e.to_string())
}

/// Empties the avatar cache and reclaims the freed space on disk. For the "Cached user avatars"
/// row's "Clear" action in Settings — kept separate from `clear_repo_data` since avatars are
/// kept indefinitely and only ever removed by this explicit action.
pub fn clear_avatars() -> Result<(), String> {
    let conn = conn()?;
    conn.execute_batch(
        "
        DELETE FROM avatars;
        VACUUM;
        ",
    )
    .map_err(|e| e.to_string())
}
