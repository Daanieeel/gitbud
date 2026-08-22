use serde::{Deserialize, Serialize};

use super::auth::api_base;
use crate::diff::{DiffHunk, DiffLine, FileDiff, LineKind};
use crate::image_diff::is_image_path;

const USER_AGENT: &str = "GitBud";

/// A REST client bound to one GitHub host (github.com or a GHES instance) and one token.
/// `get`/`post`/`put` take a path relative to the API base, e.g. "/repos/{owner}/{repo}/pulls".
struct GhClient {
    http: reqwest::Client,
    base: String,
}

impl GhClient {
    fn new(host: &str, token: &str) -> Result<Self, String> {
        use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT as UA};
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).map_err(|e| e.to_string())?,
        );
        headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));
        headers.insert(UA, HeaderValue::from_static(USER_AGENT));
        let http = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self { http, base: api_base(host) })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base, path)
    }

    fn get(&self, path: &str) -> reqwest::RequestBuilder {
        self.http.get(self.url(path))
    }

    fn post(&self, path: &str) -> reqwest::RequestBuilder {
        self.http.post(self.url(path))
    }

    fn put(&self, path: &str) -> reqwest::RequestBuilder {
        self.http.put(self.url(path))
    }
}

async fn check(res: reqwest::Response) -> Result<reqwest::Response, String> {
    if res.status().is_success() {
        Ok(res)
    } else {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        Err(format!("GitHub API error {status}: {body}"))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub draft: bool,
    pub html_url: String,
    pub author_login: String,
    pub head_ref: String,
    pub head_sha: String,
    pub base_ref: String,
    pub merged: bool,
    pub mergeable: Option<bool>,
    pub labels: Vec<String>,
}

#[derive(Deserialize)]
struct RawUser {
    login: String,
}

#[derive(Deserialize)]
struct RawRef {
    #[serde(rename = "ref")]
    ref_name: String,
    sha: String,
}

#[derive(Deserialize)]
struct RawLabel {
    name: String,
}

#[derive(Deserialize)]
struct RawPullRequest {
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    draft: bool,
    html_url: String,
    user: RawUser,
    head: RawRef,
    base: RawRef,
    #[serde(default)]
    merged: bool,
    #[serde(default)]
    mergeable: Option<bool>,
    #[serde(default)]
    labels: Vec<RawLabel>,
}

impl From<RawPullRequest> for PullRequest {
    fn from(raw: RawPullRequest) -> Self {
        PullRequest {
            number: raw.number,
            title: raw.title,
            body: raw.body,
            state: raw.state,
            draft: raw.draft,
            html_url: raw.html_url,
            author_login: raw.user.login,
            head_ref: raw.head.ref_name,
            head_sha: raw.head.sha,
            base_ref: raw.base.ref_name,
            merged: raw.merged,
            mergeable: raw.mergeable,
            labels: raw.labels.into_iter().map(|l| l.name).collect(),
        }
    }
}

/// `state` is one of "open", "closed", or "all" (GitHub's PR-list convention — "closed"
/// includes both merged and unmerged-but-closed PRs, distinguished by `merged`).
pub async fn list_pull_requests(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    state: &str,
) -> Result<Vec<PullRequest>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls?state={state}&per_page=50");
    let res = check(gh.get(&path).send().await.map_err(|e| e.to_string())?).await?;
    let raw: Vec<RawPullRequest> = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into_iter().map(PullRequest::from).collect())
}

pub async fn get_pull_request(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<PullRequest, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}");
    let res = check(gh.get(&path).send().await.map_err(|e| e.to_string())?).await?;
    let raw: RawPullRequest = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into())
}

#[derive(Debug, Serialize)]
struct CreatePrBody<'a> {
    title: &'a str,
    head: &'a str,
    base: &'a str,
    body: &'a str,
    draft: bool,
}

#[allow(clippy::too_many_arguments)]
pub async fn create_pull_request(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    title: &str,
    head: &str,
    base: &str,
    body: &str,
    draft: bool,
) -> Result<PullRequest, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls");
    let res = check(
        gh.post(&path)
            .json(&CreatePrBody { title, head, base, body, draft })
            .send()
            .await
            .map_err(|e| e.to_string())?,
    )
    .await?;
    let raw: RawPullRequest = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into())
}

#[derive(Debug, Serialize)]
struct MergeBody<'a> {
    merge_method: &'a str,
}

pub async fn merge_pull_request(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    merge_method: &str,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/merge");
    check(
        gh.put(&path)
            .json(&MergeBody { merge_method })
            .send()
            .await
            .map_err(|e| e.to_string())?,
    )
    .await?;
    Ok(())
}

#[derive(Deserialize)]
struct RawPullRequestFile {
    filename: String,
    status: String,
    patch: Option<String>,
}

/// Fetches the files changed by a PR and returns them as our shared `FileDiff` shape
/// (parsed from GitHub's unified-diff `patch` text) so the same DiffView renders them.
pub async fn list_pull_request_files(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<Vec<(String, String, FileDiff)>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/files?per_page=100");
    let res = check(gh.get(&path).send().await.map_err(|e| e.to_string())?).await?;
    let raw: Vec<RawPullRequestFile> = res.json().await.map_err(|e| e.to_string())?;

    Ok(raw
        .into_iter()
        .map(|f| {
            let hunks = f.patch.as_deref().map(parse_patch).unwrap_or_default();
            let diff = FileDiff {
                is_image: is_image_path(&f.filename),
                path: f.filename.clone(),
                old_path: None,
                is_binary: f.patch.is_none(),
                hunks,
            };
            (f.filename, f.status, diff)
        })
        .collect())
}

/// Parses GitHub's per-file unified-diff `patch` text (hunks only, no `diff --git`/`---`/`+++`
/// preamble) into our shared hunk/line structure.
fn parse_patch(patch: &str) -> Vec<DiffHunk> {
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut old_line = 0u32;
    let mut new_line = 0u32;

    for raw_line in patch.lines() {
        if let Some(rest) = raw_line.strip_prefix("@@") {
            let (old_start, new_start) = parse_hunk_header(rest);
            old_line = old_start;
            new_line = new_start;
            hunks.push(DiffHunk {
                header: raw_line.to_string(),
                lines: Vec::new(),
            });
            continue;
        }
        let Some(hunk) = hunks.last_mut() else { continue };
        if let Some(content) = raw_line.strip_prefix('+') {
            hunk.lines.push(DiffLine {
                kind: LineKind::Addition,
                content: content.to_string(),
                old_lineno: None,
                new_lineno: Some(new_line),
            });
            new_line += 1;
        } else if let Some(content) = raw_line.strip_prefix('-') {
            hunk.lines.push(DiffLine {
                kind: LineKind::Deletion,
                content: content.to_string(),
                old_lineno: Some(old_line),
                new_lineno: None,
            });
            old_line += 1;
        } else {
            let content = raw_line.strip_prefix(' ').unwrap_or(raw_line);
            hunk.lines.push(DiffLine {
                kind: LineKind::Context,
                content: content.to_string(),
                old_lineno: Some(old_line),
                new_lineno: Some(new_line),
            });
            old_line += 1;
            new_line += 1;
        }
    }
    hunks
}

/// Parses "@@ -old_start,old_count +new_start,new_count @@" (the `rest` after the
/// leading "@@") and returns (old_start, new_start), defaulting to 1 on any surprise.
fn parse_hunk_header(rest: &str) -> (u32, u32) {
    let inner = rest.split("@@").next().unwrap_or("").trim();
    let mut old_start = 1u32;
    let mut new_start = 1u32;
    for part in inner.split_whitespace() {
        if let Some(p) = part.strip_prefix('-') {
            old_start = p.split(',').next().unwrap_or("1").parse().unwrap_or(1);
        } else if let Some(p) = part.strip_prefix('+') {
            new_start = p.split(',').next().unwrap_or("1").parse().unwrap_or(1);
        }
    }
    (old_start, new_start)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewComment {
    pub id: u64,
    pub path: String,
    pub line: Option<u32>,
    pub side: Option<String>,
    pub body: String,
    pub user_login: String,
    pub created_at: String,
    pub in_reply_to_id: Option<u64>,
}

#[derive(Deserialize)]
struct RawReviewComment {
    id: u64,
    path: String,
    line: Option<u32>,
    side: Option<String>,
    body: String,
    user: RawUser,
    created_at: String,
    #[serde(default)]
    in_reply_to_id: Option<u64>,
}

impl From<RawReviewComment> for ReviewComment {
    fn from(raw: RawReviewComment) -> Self {
        ReviewComment {
            id: raw.id,
            path: raw.path,
            line: raw.line,
            side: raw.side,
            body: raw.body,
            user_login: raw.user.login,
            created_at: raw.created_at,
            in_reply_to_id: raw.in_reply_to_id,
        }
    }
}

pub async fn list_review_comments(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<Vec<ReviewComment>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/comments?per_page=100");
    let res = check(gh.get(&path).send().await.map_err(|e| e.to_string())?).await?;
    let raw: Vec<RawReviewComment> = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into_iter().map(ReviewComment::from).collect())
}

#[derive(Debug, Serialize)]
struct CreateReviewCommentBody<'a> {
    body: &'a str,
    commit_id: &'a str,
    path: &'a str,
    line: u32,
    side: &'a str,
}

#[allow(clippy::too_many_arguments)]
pub async fn create_review_comment(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    commit_id: &str,
    path: &str,
    line: u32,
    side: &str,
    body: &str,
) -> Result<ReviewComment, String> {
    let gh = GhClient::new(host, token)?;
    let url_path = format!("/repos/{owner}/{repo}/pulls/{number}/comments");
    let res = check(
        gh.post(&url_path)
            .json(&CreateReviewCommentBody { body, commit_id, path, line, side })
            .send()
            .await
            .map_err(|e| e.to_string())?,
    )
    .await?;
    let raw: RawReviewComment = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckRun {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub html_url: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Deserialize)]
struct CheckRunsResponse {
    check_runs: Vec<CheckRun>,
}

/// Fetches GitHub Actions check-run results for a commit sha (used for CI status badges
/// on PR rows and commit rows).
pub async fn list_check_runs(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    sha: &str,
) -> Result<Vec<CheckRun>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/commits/{sha}/check-runs?per_page=50");
    let res = check(gh.get(&path).send().await.map_err(|e| e.to_string())?).await?;
    let parsed: CheckRunsResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.check_runs)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitVerification {
    pub verified: bool,
    pub reason: String,
}

#[derive(Deserialize)]
struct CommitDetailResponse {
    commit: CommitDetailInner,
}

#[derive(Deserialize)]
struct CommitDetailInner {
    verification: CommitVerification,
}

/// Looks up GPG/SSH signature verification for a commit already pushed to GitHub.
pub async fn get_commit_verification(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    sha: &str,
) -> Result<CommitVerification, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/commits/{sha}");
    let res = check(gh.get(&path).send().await.map_err(|e| e.to_string())?).await?;
    let parsed: CommitDetailResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.commit.verification)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepo {
    pub full_name: String,
    pub clone_url: String,
    pub description: Option<String>,
    pub private: bool,
    pub fork: bool,
    pub updated_at: String,
}

/// Lists the authenticated user's own repos, plus org repos they have access to, newest first —
/// backs the "browse your repos" clone picker.
pub async fn list_user_repos(host: &str, token: &str) -> Result<Vec<GitHubRepo>, String> {
    let gh = GhClient::new(host, token)?;
    let path = "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member";
    let res = check(gh.get(path).send().await.map_err(|e| e.to_string())?).await?;
    res.json().await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_github_patch_into_hunks() {
        let patch = "@@ -1,2 +1,3 @@\n context\n-old line\n+new line\n+added line";
        let hunks = parse_patch(patch);
        assert_eq!(hunks.len(), 1);
        let lines = &hunks[0].lines;
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0].kind, LineKind::Context);
        assert_eq!(lines[0].old_lineno, Some(1));
        assert_eq!(lines[0].new_lineno, Some(1));
        assert_eq!(lines[1].kind, LineKind::Deletion);
        assert_eq!(lines[1].old_lineno, Some(2));
        assert_eq!(lines[2].kind, LineKind::Addition);
        assert_eq!(lines[2].new_lineno, Some(2));
        assert_eq!(lines[3].content, "added line");
    }
}
