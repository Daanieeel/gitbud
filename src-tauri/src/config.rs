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
    #[serde(default)]
    pub last_fetched: Option<i64>,
    /// User-assigned sidebar sections (e.g. "Work", "Personal") this repo is pinned to, for
    /// quick access. Additive — a repo can belong to any number of sections at once, and stays
    /// visible under its auto-derived `group` regardless.
    #[serde(default)]
    pub sections: Vec<String>,
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

/// Migrates the old single, overriding `section: Option<String>` field (from before repos
/// could be pinned to more than one section) into the new `sections: Vec<String>` field, so
/// upgrading doesn't silently drop anyone's existing pin.
fn migrate_legacy_section(mut value: serde_json::Value) -> serde_json::Value {
    if let Some(repos) = value.get_mut("repos").and_then(|r| r.as_array_mut()) {
        for repo in repos {
            let Some(obj) = repo.as_object_mut() else { continue };
            let has_sections = obj.get("sections").is_some_and(|s| s.is_array());
            if has_sections {
                continue;
            }
            if let Some(section) = obj.remove("section").and_then(|s| s.as_str().map(str::to_string)) {
                obj.insert("sections".to_string(), serde_json::json!([section]));
            }
        }
    }
    value
}

pub fn load_repos() -> Result<Vec<RepoEntry>, String> {
    let file = repos_file()?;
    if !file.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_value(migrate_legacy_section(value)).map_err(|e| e.to_string())?;
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

/// Strips a leading "user@" and trailing ":port" from a host token, e.g.
/// "git@example.com:2222" -> "example.com".
fn clean_host(raw: &str) -> String {
    let after_at = raw.rsplit('@').next().unwrap_or(raw);
    after_at.split(':').next().unwrap_or(after_at).to_string()
}

/// Parses a git remote URL into (host, owner, repo), handling both
/// "git@host:owner/repo.git" and "https://host/owner/repo.git" forms.
fn parse_remote(url: &str) -> Option<(String, String, String)> {
    let trimmed = url.trim_end_matches(".git").trim_end_matches('/');
    let (host_raw, path_part) = if let Some(idx) = trimmed.find("://") {
        let after_scheme = &trimmed[idx + 3..];
        let mut parts = after_scheme.splitn(2, '/');
        (parts.next()?, parts.next()?)
    } else if let Some(idx) = trimmed.find(':') {
        (&trimmed[..idx], &trimmed[idx + 1..])
    } else {
        return None;
    };
    let host = clean_host(host_raw);

    let mut segments = path_part.rsplitn(2, '/');
    let repo_name = segments.next()?.to_string();
    let owner = segments.next()?.to_string();
    if host.is_empty() || owner.is_empty() || repo_name.is_empty() {
        return None;
    }
    Some((host, owner, repo_name))
}

/// Parses "owner/repo" out of an `origin`-style remote URL.
fn parse_owner_repo(url: &str) -> Option<(String, String)> {
    parse_remote(url).map(|(_, owner, repo)| (owner, repo))
}

/// Parses "owner/repo" out of a repo's `origin` remote URL.
pub fn remote_owner_repo(repo_path: &str) -> Option<(String, String)> {
    let repo = Repository::open(repo_path).ok()?;
    let url = repo.find_remote("origin").ok()?.url()?.to_string();
    parse_owner_repo(&url)
}

/// The host and best-effort web URL for a repo's `origin` remote, regardless of forge —
/// works for any host that serves its web UI at the same `host/owner/repo` path as its git
/// remote (GitHub, GitLab, Bitbucket, self-hosted Gitea/Forgejo, etc).
pub fn remote_web_info(repo_path: &str) -> Option<(String, String)> {
    let repo = Repository::open(repo_path).ok()?;
    let url = repo.find_remote("origin").ok()?.url()?.to_string();
    let (host, owner, repo_name) = parse_remote(&url)?;
    let web_url = format!("https://{host}/{owner}/{repo_name}");
    Some((host, web_url))
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
        last_fetched: None,
        sections: Vec::new(),
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

pub fn add_repo_section(path: &str, section: &str) -> Result<Vec<RepoEntry>, String> {
    let section = section.trim();
    let mut repos = load_repos()?;
    if let Some(entry) = repos.iter_mut().find(|r| r.path == path) {
        if !section.is_empty() && !entry.sections.iter().any(|s| s == section) {
            entry.sections.push(section.to_string());
        }
    }
    save_repos(&repos)?;
    Ok(repos)
}

pub fn remove_repo_section(path: &str, section: &str) -> Result<Vec<RepoEntry>, String> {
    let mut repos = load_repos()?;
    if let Some(entry) = repos.iter_mut().find(|r| r.path == path) {
        entry.sections.retain(|s| s != section);
    }
    save_repos(&repos)?;
    Ok(repos)
}

/// Unpins every repo from `section` — the section itself has no identity beyond the repos
/// that reference it, so "removing" it just means no repo references it any more.
pub fn remove_section(section: &str) -> Result<Vec<RepoEntry>, String> {
    let mut repos = load_repos()?;
    for entry in repos.iter_mut() {
        entry.sections.retain(|s| s != section);
    }
    save_repos(&repos)?;
    Ok(repos)
}

pub fn rename_section(old: &str, new: &str) -> Result<Vec<RepoEntry>, String> {
    let new = new.trim();
    if new.is_empty() || new == old {
        return load_repos();
    }
    let mut repos = load_repos()?;
    for entry in repos.iter_mut() {
        if entry.sections.iter().any(|s| s == old) {
            entry.sections.retain(|s| s != old);
            if !entry.sections.iter().any(|s| s == new) {
                entry.sections.push(new.to_string());
            }
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_remote_ssh_form_captures_host() {
        assert_eq!(
            parse_remote("git@github.com:owner/repo.git"),
            Some(("github.com".to_string(), "owner".to_string(), "repo".to_string()))
        );
    }

    #[test]
    fn parse_remote_https_form_captures_host() {
        assert_eq!(
            parse_remote("https://gitlab.com/owner/repo.git"),
            Some(("gitlab.com".to_string(), "owner".to_string(), "repo".to_string()))
        );
    }

    #[test]
    fn parse_remote_ssh_scheme_with_port_strips_user_and_port() {
        assert_eq!(
            parse_remote("ssh://git@example.com:2222/owner/repo.git"),
            Some(("example.com".to_string(), "owner".to_string(), "repo".to_string()))
        );
    }

    #[test]
    fn parse_owner_repo_ssh_form() {
        assert_eq!(
            parse_owner_repo("git@github.com:owner/repo.git"),
            Some(("owner".to_string(), "repo".to_string()))
        );
    }

    #[test]
    fn parse_owner_repo_https_form() {
        assert_eq!(
            parse_owner_repo("https://github.com/owner/repo.git"),
            Some(("owner".to_string(), "repo".to_string()))
        );
    }

    #[test]
    fn parse_owner_repo_https_no_dot_git_suffix() {
        assert_eq!(
            parse_owner_repo("https://github.com/owner/repo"),
            Some(("owner".to_string(), "repo".to_string()))
        );
    }

    #[test]
    fn parse_owner_repo_trailing_slash() {
        assert_eq!(
            parse_owner_repo("https://github.com/owner/repo/"),
            Some(("owner".to_string(), "repo".to_string()))
        );
    }

    #[test]
    fn parse_owner_repo_enterprise_host() {
        assert_eq!(
            parse_owner_repo("https://git.company.com/owner/repo.git"),
            Some(("owner".to_string(), "repo".to_string()))
        );
    }

    #[test]
    fn parse_owner_repo_rejects_host_only_url() {
        assert_eq!(parse_owner_repo("https://github.com/"), None);
        assert_eq!(parse_owner_repo("https://github.com"), None);
    }

    #[test]
    fn parse_owner_repo_rejects_garbage() {
        assert_eq!(parse_owner_repo(""), None);
        assert_eq!(parse_owner_repo("not-a-url"), None);
    }

    #[test]
    fn migrate_legacy_section_converts_singular_to_plural() {
        let input = serde_json::json!({
            "repos": [{"path": "/a", "name": "a", "group": "g", "section": "Work"}]
        });
        let migrated = migrate_legacy_section(input);
        let sections = migrated["repos"][0]["sections"].as_array().unwrap();
        assert_eq!(sections, &vec![serde_json::json!("Work")]);
    }

    #[test]
    fn migrate_legacy_section_leaves_existing_sections_alone() {
        let input = serde_json::json!({
            "repos": [{"path": "/a", "name": "a", "group": "g", "sections": ["Personal"]}]
        });
        let migrated = migrate_legacy_section(input.clone());
        assert_eq!(migrated, input);
    }

    #[test]
    fn migrate_legacy_section_handles_missing_section_field() {
        let input = serde_json::json!({
            "repos": [{"path": "/a", "name": "a", "group": "g"}]
        });
        let migrated = migrate_legacy_section(input.clone());
        assert_eq!(migrated, input);
    }
}
