use git2::Repository;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoEntry {
    pub path: String,
    pub name: String,
    pub group: String,
    pub is_private: bool,
    #[serde(default)]
    pub last_fetched: Option<i64>,
    /// User-assigned sidebar section (e.g. "Work", "Personal"), overriding the auto-derived
    /// `group` for display purposes. `None` means "use the auto-derived group".
    #[serde(default)]
    pub section: Option<String>,
    /// Per-repo override of which git identity (a GitHub account or SSH identity, opaque id
    /// interpreted by the frontend) authenticates git operations here. `None` means "use the
    /// global default identity".
    #[serde(default)]
    pub identity_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct RepoConfig {
    repos: Vec<RepoEntry>,
}

fn config_dir() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or("could not resolve config directory")?;
    let dir = base.join("gitbud");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn repos_file() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("repos.json"))
}

pub fn load_repos() -> Result<Vec<RepoEntry>, String> {
    let file = repos_file()?;
    if !file.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let config: RepoConfig = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    Ok(config.repos)
}

fn save_repos(repos: &[RepoEntry]) -> Result<(), String> {
    let file = repos_file()?;
    let config = RepoConfig {
        repos: repos.to_vec(),
    };
    let contents = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&file, contents).map_err(|e| e.to_string())
}

/// Parses "owner/repo" out of an `origin` remote URL, handling both
/// "git@host:owner/repo.git" and "https://host/owner/repo.git" forms.
pub fn remote_owner_repo(repo_path: &str) -> Option<(String, String)> {
    let repo = Repository::open(repo_path).ok()?;
    let url = repo.find_remote("origin").ok()?.url()?.to_string();

    let trimmed = url.trim_end_matches(".git").trim_end_matches('/');
    let path_part = if let Some(idx) = trimmed.find("://") {
        &trimmed[idx + 3..]
    } else if let Some(idx) = trimmed.find(':') {
        &trimmed[idx + 1..]
    } else {
        trimmed
    };
    // Drop the host segment (everything up to the first '/').
    let path_part = path_part.splitn(2, '/').nth(1)?;
    let mut segments = path_part.rsplitn(2, '/');
    let repo_name = segments.next()?.to_string();
    let owner = segments.next()?.to_string();
    if owner.is_empty() || repo_name.is_empty() {
        return None;
    }
    Some((owner, repo_name))
}

/// Derives an owner/group key from a remote URL, e.g. "git@github.com:owner/repo.git" -> "owner".
/// Falls back to "Local" when there's no remote to key off of.
fn group_from_remote(repo_path: &str) -> String {
    remote_owner_repo(repo_path)
        .map(|(owner, _)| owner)
        .unwrap_or_else(|| "Local".to_string())
}

pub fn add_repo(path: &str) -> Result<Vec<RepoEntry>, String> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    let mut repos = load_repos()?;
    if repos.iter().any(|r| r.path == canonical) {
        return Ok(repos);
    }

    Repository::open(&canonical).map_err(|e| e.message().to_string())?;
    let name = std::path::Path::new(&canonical)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical.clone());
    let group = group_from_remote(&canonical);

    repos.push(RepoEntry {
        path: canonical,
        name,
        group,
        is_private: false,
        last_fetched: None,
        section: None,
        identity_id: None,
    });
    save_repos(&repos)?;
    Ok(repos)
}

pub fn remove_repo(path: &str) -> Result<Vec<RepoEntry>, String> {
    let mut repos = load_repos()?;
    repos.retain(|r| r.path != path);
    save_repos(&repos)?;
    Ok(repos)
}

pub fn set_repo_private(path: &str, is_private: bool) -> Result<Vec<RepoEntry>, String> {
    let mut repos = load_repos()?;
    if let Some(entry) = repos.iter_mut().find(|r| r.path == path) {
        entry.is_private = is_private;
    }
    save_repos(&repos)?;
    Ok(repos)
}

pub fn set_repo_section(path: &str, section: Option<String>) -> Result<Vec<RepoEntry>, String> {
    let mut repos = load_repos()?;
    if let Some(entry) = repos.iter_mut().find(|r| r.path == path) {
        entry.section = section.filter(|s| !s.trim().is_empty());
    }
    save_repos(&repos)?;
    Ok(repos)
}

pub fn set_repo_identity(path: &str, identity_id: Option<String>) -> Result<Vec<RepoEntry>, String> {
    let mut repos = load_repos()?;
    if let Some(entry) = repos.iter_mut().find(|r| r.path == path) {
        entry.identity_id = identity_id.filter(|s| !s.trim().is_empty());
    }
    save_repos(&repos)?;
    Ok(repos)
}

/// Reorders the repo list to match `order` (a list of paths), for manual drag-to-reorder in
/// the sidebar. Repos not mentioned in `order` (shouldn't normally happen) keep their
/// relative order and are appended at the end.
pub fn set_repo_order(order: &[String]) -> Result<Vec<RepoEntry>, String> {
    let repos = load_repos()?;
    let mut by_path: HashMap<String, RepoEntry> =
        repos.into_iter().map(|r| (r.path.clone(), r)).collect();

    let mut reordered = Vec::with_capacity(by_path.len());
    for path in order {
        if let Some(entry) = by_path.remove(path) {
            reordered.push(entry);
        }
    }
    reordered.extend(by_path.into_values());

    save_repos(&reordered)?;
    Ok(reordered)
}

pub fn touch_last_fetched(path: &str, timestamp: i64) -> Result<Vec<RepoEntry>, String> {
    let mut repos = load_repos()?;
    if let Some(entry) = repos.iter_mut().find(|r| r.path == path) {
        entry.last_fetched = Some(timestamp);
    }
    save_repos(&repos)?;
    Ok(repos)
}
