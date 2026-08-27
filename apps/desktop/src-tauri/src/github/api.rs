use serde::{Deserialize, Serialize};

use super::auth::{api_base, graphql_base, web_base};
use crate::diff::{DiffHunk, DiffLine, FileDiff, LineKind, PrFileEntry};
use crate::image_diff::{is_image_path, mime_for, ImageDiff};

const USER_AGENT: &str = "GitBud";

/// Reqwest's default `Display` for connection-level failures is a nested chain like
/// "error sending request for url (...): error trying to connect: dns error: ..." — readable to
/// a developer, not a user. Collapse those into one plain sentence; anything else (a genuine
/// non-connectivity failure, e.g. a body/decode error) falls back to the raw message.
fn send_err(err: reqwest::Error) -> String {
    if err.is_timeout() {
        "GitHub request timed out, check your internet connection.".to_string()
    } else if err.is_connect() {
        "Couldn't connect to GitHub, check your internet connection.".to_string()
    } else {
        err.to_string()
    }
}

/// A REST client bound to one GitHub host (github.com or a GHES instance) and one token.
/// `get`/`post`/`put` take a path relative to the API base, e.g. "/repos/{owner}/{repo}/pulls".
struct GhClient {
    http: reqwest::Client,
    base: String,
    graphql: String,
}

impl GhClient {
    fn new(host: &str, token: &str) -> Result<Self, String> {
        use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT as UA};
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).map_err(|e| e.to_string())?,
        );
        headers.insert(
            ACCEPT,
            HeaderValue::from_static("application/vnd.github+json"),
        );
        headers.insert(UA, HeaderValue::from_static(USER_AGENT));
        let http = reqwest::Client::builder()
            .default_headers(headers)
            // Unset by default, reqwest waits on the OS-level TCP timeout (often 20s+) before
            // surfacing a connect failure — that's the delay behind a slow-to-appear offline
            // banner on the very first request after losing connectivity.
            .connect_timeout(std::time::Duration::from_secs(6))
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            http,
            base: api_base(host),
            graphql: graphql_base(host),
        })
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

    fn patch(&self, path: &str) -> reqwest::RequestBuilder {
        self.http.patch(self.url(path))
    }

    fn delete(&self, path: &str) -> reqwest::RequestBuilder {
        self.http.delete(self.url(path))
    }

    /// GitHub Projects (v2) has no REST surface — `query`/`variables` go straight to the
    /// GraphQL endpoint. Unlike REST, GraphQL returns 200 even on a semantic failure, with the
    /// problem described in an `errors` array instead, so that has to be checked explicitly.
    async fn graphql<T: for<'de> Deserialize<'de>>(
        &self,
        query: &str,
        variables: serde_json::Value,
    ) -> Result<T, String> {
        #[derive(Serialize)]
        struct Body<'a> {
            query: &'a str,
            variables: serde_json::Value,
        }
        #[derive(Deserialize)]
        struct GraphQlError {
            message: String,
        }
        #[derive(Deserialize)]
        struct GraphQlResponse<T> {
            data: Option<T>,
            #[serde(default)]
            errors: Vec<GraphQlError>,
        }

        let res = send_checked(
            self.http
                .post(&self.graphql)
                .json(&Body { query, variables }),
        )
        .await?;
        let parsed: GraphQlResponse<T> = res.json().await.map_err(|e| e.to_string())?;
        if !parsed.errors.is_empty() {
            let messages: Vec<String> = parsed.errors.into_iter().map(|e| e.message).collect();
            return Err(messages.join("; "));
        }
        parsed
            .data
            .ok_or_else(|| "GraphQL response had no data".to_string())
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

const MAX_RATE_LIMIT_RETRIES: u32 = 3;

/// How long to back off before retrying, if `res` looks like a GitHub rate limit response —
/// primary (429, or 403 with `X-RateLimit-Remaining: 0`) or secondary (403 with `Retry-After`,
/// GitHub's signal for "too many requests too fast", distinct from the hourly primary limit).
/// `None` for anything else, including a plain permission-denied 403, which must not be retried.
fn rate_limit_wait(res: &reqwest::Response) -> Option<std::time::Duration> {
    use reqwest::StatusCode;
    let status = res.status();
    if status != StatusCode::TOO_MANY_REQUESTS && status != StatusCode::FORBIDDEN {
        return None;
    }
    let header = |name: &str| res.headers().get(name).and_then(|v| v.to_str().ok());

    if let Some(secs) = header("retry-after").and_then(|s| s.parse::<u64>().ok()) {
        return Some(std::time::Duration::from_secs(secs.min(60)));
    }
    if header("x-ratelimit-remaining") == Some("0") {
        if let Some(reset) = header("x-ratelimit-reset").and_then(|s| s.parse::<i64>().ok()) {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            return Some(std::time::Duration::from_secs(
                (reset - now).clamp(1, 60) as u64
            ));
        }
    }
    // A 429 with no informative headers at all still deserves one short backoff rather than an
    // immediate raw error; a 403 with neither header is a normal permission failure, not a
    // rate limit, so it's left alone (falls through to `None`).
    (status == StatusCode::TOO_MANY_REQUESTS).then(|| std::time::Duration::from_secs(2))
}

/// Sends `builder`, transparently backing off and retrying when the response is a GitHub rate
/// limit (see `rate_limit_wait`) instead of surfacing it as a raw error straight away — GitHub's
/// ToS bans "abusive" request volume, and a busy user clicking around this app can otherwise trip
/// its secondary rate limit during totally ordinary use. Falls back to a plain send when the
/// request body can't be cloned for a retry (only possible for a streamed body — none of this
/// file's requests use one).
async fn send_checked(builder: reqwest::RequestBuilder) -> Result<reqwest::Response, String> {
    check(send_with_retry(builder).await?).await
}

/// The retry-on-rate-limit loop behind `send_checked`, split out so callers that need to
/// inspect the raw status themselves (e.g. `delete_branch`'s "already gone" 422) can do so
/// before it's turned into an `Err`.
async fn send_with_retry(
    mut builder: reqwest::RequestBuilder,
) -> Result<reqwest::Response, String> {
    let mut attempt = 0;
    loop {
        let retry_clone = builder.try_clone();
        let res = builder.send().await.map_err(send_err)?;
        if attempt >= MAX_RATE_LIMIT_RETRIES {
            return Ok(res);
        }
        let Some(wait) = rate_limit_wait(&res) else {
            return Ok(res);
        };
        let Some(next) = retry_clone else {
            return Ok(res);
        };
        tokio::time::sleep(wait).await;
        builder = next;
        attempt += 1;
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
    pub author_avatar_url: String,
    pub head_ref: String,
    pub head_sha: String,
    pub base_ref: String,
    pub base_sha: String,
    pub merged: bool,
    pub mergeable: Option<bool>,
    pub labels: Vec<String>,
}

#[derive(Deserialize)]
struct RawUser {
    login: String,
    avatar_url: String,
}

#[derive(Deserialize)]
struct SearchUsersResponse {
    items: Vec<RawUser>,
}

/// Looks up a GitHub avatar for a plain git commit author by email — used for commit history,
/// where (unlike a PR/review author) all we start with is whatever the commit itself recorded.
/// Only finds a match if that email is public/verified on the account's GitHub profile, so
/// this is "if available", not a hard guarantee. One request per unique email (callers should
/// cache), not per commit.
/// GitHub's own auto-generated commit email (`{username}@users.noreply.{host}`, or
/// `{id}+{username}@users.noreply.{host}` when "keep my email private" is on) already encodes
/// the username — the overwhelming majority of commit authors we'll actually see, and unlike a
/// real address it's never searchable by `find_user_avatar_by_email`'s `/search/users` fallback
/// (GitHub excludes noreply addresses from that index entirely, so it would always return zero
/// results). Extracting the username directly turns this into a no-API-call, always-correct
/// lookup instead of a search that's guaranteed to come up empty.
fn github_noreply_username<'a>(email: &'a str, host: &str) -> Option<&'a str> {
    let local = email.strip_suffix(&format!("@users.noreply.{host}"))?;
    Some(local.rsplit('+').next().unwrap_or(local))
}

pub async fn find_user_avatar_by_email(
    host: &str,
    token: &str,
    email: &str,
) -> Result<Option<String>, String> {
    if let Some(username) = github_noreply_username(email, host) {
        // The `{web_base}/{username}.png` redirect only exists for real user/org accounts — it
        // 404s for a bot account (e.g. `github-actions[bot]`, whose noreply email is
        // `41898282+github-actions[bot]@users.noreply.github.com`), since those aren't served by
        // the same route. Bots are still directly, exactly addressable by login via the Users
        // API though, so fetch that instead of falling through to the `/search/users` email
        // search below (which, like the `.png` shortcut, excludes noreply addresses entirely).
        if username.ends_with("[bot]") {
            let gh = GhClient::new(host, token)?;
            let res = send_checked(gh.get(&format!("/users/{username}"))).await?;
            let user: RawUser = res.json().await.map_err(|e| e.to_string())?;
            return Ok(Some(user.avatar_url));
        }
        return Ok(Some(format!("{}/{username}.png", web_base(host))));
    }
    let gh = GhClient::new(host, token)?;
    let query = format!("{email} in:email");
    let res = send_checked(
        gh.get("/search/users")
            .query(&[("q", query.as_str()), ("per_page", "1")]),
    )
    .await?;
    let parsed: SearchUsersResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.items.into_iter().next().map(|u| u.avatar_url))
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
    // GitHub's list-pull-requests endpoint (unlike get-a-single-pull-request) doesn't include a
    // `merged` boolean at all — only `merged_at`, null for an unmerged PR. Deriving `merged`
    // from that instead of trusting a `merged` field means both endpoints report it correctly.
    #[serde(default)]
    merged_at: Option<String>,
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
            author_avatar_url: raw.user.avatar_url,
            head_ref: raw.head.ref_name,
            head_sha: raw.head.sha,
            base_ref: raw.base.ref_name,
            base_sha: raw.base.sha,
            merged: raw.merged_at.is_some(),
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
    page: u32,
) -> Result<Vec<PullRequest>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls?state={state}&per_page=50&page={page}");
    let res = send_checked(gh.get(&path)).await?;
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
    let res = send_checked(gh.get(&path)).await?;
    let raw: RawPullRequest = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoMergeSettings {
    pub allow_merge_commit: bool,
    pub allow_squash_merge: bool,
    pub allow_rebase_merge: bool,
    /// Repo-level default for the merge dialog's "Delete branch after merge" checkbox.
    pub delete_branch_on_merge: bool,
}

#[derive(Deserialize)]
struct RawRepo {
    #[serde(default = "default_true")]
    allow_merge_commit: bool,
    #[serde(default = "default_true")]
    allow_squash_merge: bool,
    #[serde(default = "default_true")]
    allow_rebase_merge: bool,
    #[serde(default)]
    delete_branch_on_merge: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Deserialize, Default)]
struct RawLinearHistorySetting {
    #[serde(default)]
    enabled: bool,
}

#[derive(Deserialize, Default)]
struct RawBranchProtection {
    #[serde(default)]
    required_linear_history: RawLinearHistorySetting,
}

/// Whether `branch`'s protection rules require a linear history — the one branch-protection
/// setting that overrides a repo-level merge-method toggle (it forbids merge commits even if
/// the repo itself allows them, since a merge commit isn't linear). Best-effort: an unprotected
/// branch (404) or a token without permission to view protection settings (403) both just mean
/// "no additional restriction visible to us", not an error worth surfacing.
async fn requires_linear_history(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    branch: &str,
) -> bool {
    let Ok(gh) = GhClient::new(host, token) else {
        return false;
    };
    let path = format!("/repos/{owner}/{repo}/branches/{branch}/protection");
    let Ok(res) = gh.get(&path).send().await else {
        return false;
    };
    if !res.status().is_success() {
        return false;
    }
    res.json::<RawBranchProtection>()
        .await
        .map(|p| p.required_linear_history.enabled)
        .unwrap_or(false)
}

#[derive(Deserialize)]
struct RawEffectiveRule {
    #[serde(rename = "type")]
    rule_type: String,
    #[serde(default)]
    parameters: Option<serde_json::Value>,
}

/// Repository rulesets (the newer replacement for classic branch protection) can restrict a
/// branch's PRs to a subset of merge methods via a `pull_request` rule's `allowed_merge_methods`
/// parameter — a setting that lives entirely outside both the repo-level merge-method toggles
/// and classic branch protection, so neither of those alone can catch it. The "effective rules
/// for a branch" endpoint used here does GitHub's own ruleset-matching for us (by branch name
/// pattern, across every ruleset that applies) rather than requiring us to fetch and evaluate
/// rulesets ourselves. Returns `None` when no ruleset restricts merge methods (not the same as
/// an empty list, which would mean "nothing allowed").
async fn ruleset_allowed_merge_methods(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    branch: &str,
) -> Option<Vec<String>> {
    let gh = GhClient::new(host, token).ok()?;
    // A `/` in the branch name is a path separator to an HTTP server, not part of the branch
    // name, unless escaped — GitHub's docs call for encoding it as %2F specifically here.
    let encoded_branch = branch.replace('/', "%2F");
    let path = format!("/repos/{owner}/{repo}/rules/branches/{encoded_branch}");
    let res = gh.get(&path).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let rules: Vec<RawEffectiveRule> = res.json().await.ok()?;

    let mut result: Option<Vec<String>> = None;
    for rule in rules {
        if rule.rule_type != "pull_request" {
            continue;
        }
        let Some(methods) = rule
            .parameters
            .as_ref()
            .and_then(|p| p.get("allowed_merge_methods"))
            .and_then(|m| m.as_array())
        else {
            continue;
        };
        let methods: Vec<String> = methods
            .iter()
            .filter_map(|v| v.as_str().map(str::to_string))
            .collect();
        result = Some(match result {
            // Multiple applicable rulesets each restricting methods: only what every one of
            // them allows is actually allowed.
            Some(existing) => existing
                .into_iter()
                .filter(|m| methods.contains(m))
                .collect(),
            None => methods,
        });
    }
    result
}

/// Which merge methods this repo allows, and whether it defaults to deleting the head branch
/// on merge — powers the merge dialog so it doesn't offer a method GitHub would reject with a
/// 405, and so its "Delete branch after merge" checkbox starts at the repo's own convention.
/// `base_ref` is the PR's target branch, checked for a "required linear history" protection
/// rule and a ruleset-level allowed-merge-methods restriction, either of which can additionally
/// rule out a method beyond what the repo-level settings say.
pub async fn get_repo_merge_settings(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    base_ref: &str,
) -> Result<RepoMergeSettings, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}");
    let res = send_checked(gh.get(&path)).await?;
    let raw: RawRepo = res.json().await.map_err(|e| e.to_string())?;
    let linear_history = requires_linear_history(host, token, owner, repo, base_ref).await;
    let ruleset_methods = ruleset_allowed_merge_methods(host, token, owner, repo, base_ref).await;
    let ruleset_allows = |method: &str| {
        ruleset_methods
            .as_ref()
            .is_none_or(|m| m.iter().any(|s| s == method))
    };
    Ok(RepoMergeSettings {
        allow_merge_commit: raw.allow_merge_commit && !linear_history && ruleset_allows("merge"),
        allow_squash_merge: raw.allow_squash_merge && ruleset_allows("squash"),
        allow_rebase_merge: raw.allow_rebase_merge && ruleset_allows("rebase"),
        delete_branch_on_merge: raw.delete_branch_on_merge,
    })
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
    let res = send_checked(gh.post(&path).json(&CreatePrBody {
        title,
        head,
        base,
        body,
        draft,
    }))
    .await?;
    let raw: RawPullRequest = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into())
}

#[derive(Debug, Serialize)]
struct UpdatePrBaseBody<'a> {
    base: &'a str,
}

/// Retargets an open PR onto a different base branch — GitHub's merge endpoint always merges
/// into whatever base is currently set, so changing the target has to happen as its own PATCH
/// beforehand rather than as part of the merge call itself.
pub async fn update_pull_request_base(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    base: &str,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}");
    send_checked(gh.patch(&path).json(&UpdatePrBaseBody { base })).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Label {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
struct GithubSshKey {
    key: String,
}

#[derive(Debug, Deserialize)]
struct GithubGpgKey {
    key_id: String,
}

/// Best-effort check for whether `pubkey` (an `ssh-ed25519 AAAA...` line, comment ignored) is
/// already registered on the signed-in account as a **signing** key. Needs the `read:public_key`
/// scope, which older sign-ins won't have — callers should treat any error here as "couldn't
/// confirm" rather than "not found", not surface it as a hard failure.
pub async fn has_ssh_signing_key(host: &str, token: &str, pubkey: &str) -> Result<bool, String> {
    let gh = GhClient::new(host, token)?;
    let res = send_checked(gh.get("/user/ssh_signing_keys")).await?;
    let keys: Vec<GithubSshKey> = res.json().await.map_err(|e| e.to_string())?;
    let material = |k: &str| k.split_whitespace().take(2).collect::<Vec<_>>().join(" ");
    let target = material(pubkey);
    Ok(keys.iter().any(|k| material(&k.key) == target))
}

/// Same idea for a GPG key id — needs `read:gpg_key`.
pub async fn has_gpg_key(host: &str, token: &str, key_id: &str) -> Result<bool, String> {
    let gh = GhClient::new(host, token)?;
    let res = send_checked(gh.get("/user/gpg_keys")).await?;
    let keys: Vec<GithubGpgKey> = res.json().await.map_err(|e| e.to_string())?;
    let needle = key_id.trim_start_matches("0x").to_uppercase();
    Ok(keys.iter().any(|k| {
        needle.ends_with(&k.key_id.to_uppercase()) || k.key_id.to_uppercase().ends_with(&needle)
    }))
}

pub async fn list_labels(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
) -> Result<Vec<Label>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/labels?per_page=100");
    let res = send_checked(gh.get(&path)).await?;
    res.json().await.map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignableUser {
    pub login: String,
    pub avatar_url: String,
}

/// Users who can be assigned to issues/PRs on this repo — also used as the reviewer candidate
/// list, since requesting a review from a non-collaborator isn't possible anyway.
pub async fn list_assignable_users(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
) -> Result<Vec<AssignableUser>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/assignees?per_page=100");
    let res = send_checked(gh.get(&path)).await?;
    res.json().await.map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
struct LabelsBody<'a> {
    labels: &'a [String],
}

pub async fn add_labels(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    labels: &[String],
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}/labels");
    send_checked(gh.post(&path).json(&LabelsBody { labels })).await?;
    Ok(())
}

#[derive(Debug, Serialize)]
struct AssigneesBody<'a> {
    assignees: &'a [String],
}

pub async fn add_assignees(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    assignees: &[String],
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}/assignees");
    send_checked(gh.post(&path).json(&AssigneesBody { assignees })).await?;
    Ok(())
}

#[derive(Debug, Serialize)]
struct ReviewersBody<'a> {
    reviewers: &'a [String],
}

pub async fn request_reviewers(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    reviewers: &[String],
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/requested_reviewers");
    send_checked(gh.post(&path).json(&ReviewersBody { reviewers })).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Milestone {
    pub number: u64,
    pub title: String,
}

pub async fn list_milestones(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
) -> Result<Vec<Milestone>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/milestones?state=open&per_page=100");
    let res = send_checked(gh.get(&path)).await?;
    res.json().await.map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
struct MilestoneBody {
    milestone: u64,
}

pub async fn set_milestone(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    milestone: u64,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}");
    send_checked(gh.patch(&path).json(&MilestoneBody { milestone })).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub title: String,
}

const LIST_PROJECTS_QUERY: &str = r#"
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    projectsV2(first: 50) {
      nodes { id title }
    }
  }
}
"#;

/// Lists the (Projects v2) projects linked to this repo — classic projects are deprecated
/// GitHub-wide and have no v2 equivalent surface here.
pub async fn list_projects(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
) -> Result<Vec<Project>, String> {
    #[derive(Deserialize)]
    struct Nodes {
        nodes: Vec<Project>,
    }
    #[derive(Deserialize)]
    struct RepositoryData {
        #[serde(rename = "projectsV2")]
        projects_v2: Nodes,
    }
    #[derive(Deserialize)]
    struct Data {
        repository: RepositoryData,
    }

    let gh = GhClient::new(host, token)?;
    let data: Data = gh
        .graphql(
            LIST_PROJECTS_QUERY,
            serde_json::json!({ "owner": owner, "repo": repo }),
        )
        .await?;
    Ok(data.repository.projects_v2.nodes)
}

const PR_NODE_ID_QUERY: &str = r#"
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) { id }
  }
}
"#;

const ADD_PROJECT_ITEM_MUTATION: &str = r#"
mutation($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
    item { id }
  }
}
"#;

pub async fn add_pull_request_to_project(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    project_id: &str,
) -> Result<(), String> {
    #[derive(Deserialize)]
    struct PullRequestId {
        id: String,
    }
    #[derive(Deserialize)]
    struct RepositoryData {
        #[serde(rename = "pullRequest")]
        pull_request: PullRequestId,
    }
    #[derive(Deserialize)]
    struct NodeIdData {
        repository: RepositoryData,
    }
    #[derive(Deserialize)]
    struct MutationData {
        #[allow(dead_code)]
        #[serde(rename = "addProjectV2ItemById")]
        add_project_v2_item_by_id: serde_json::Value,
    }

    let gh = GhClient::new(host, token)?;
    let node_id_data: NodeIdData = gh
        .graphql(
            PR_NODE_ID_QUERY,
            serde_json::json!({ "owner": owner, "repo": repo, "number": number }),
        )
        .await?;
    let content_id = node_id_data.repository.pull_request.id;
    let _: MutationData = gh
        .graphql(
            ADD_PROJECT_ITEM_MUTATION,
            serde_json::json!({ "projectId": project_id, "contentId": content_id }),
        )
        .await?;
    Ok(())
}

#[derive(Debug, Serialize)]
struct MergeBody<'a> {
    merge_method: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    commit_title: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    commit_message: Option<&'a str>,
    // Pins the merge to the PR's head commit at the time the user opened the merge dialog —
    // GitHub rejects the request with a 409 if the branch moved since, rather than silently
    // merging commits the user never saw/reviewed.
    #[serde(skip_serializing_if = "Option::is_none")]
    sha: Option<&'a str>,
}

// host/token/owner/repo is this file's consistent first-four-args calling convention (see
// every other function below) — a one-off params struct for just this function would diverge
// from that, not simplify it.
#[allow(clippy::too_many_arguments)]
pub async fn merge_pull_request(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    merge_method: &str,
    commit_title: Option<&str>,
    commit_message: Option<&str>,
    sha: Option<&str>,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/merge");
    send_checked(gh.put(&path).json(&MergeBody {
        merge_method,
        commit_title,
        commit_message,
        sha,
    }))
    .await?;
    Ok(())
}

/// Deletes `branch` on the remote — used for the merge dialog's "Delete branch after merge".
/// A no-op-shaped 422 (branch already gone, e.g. GitHub's own auto-delete-branch repo setting
/// beat us to it) is swallowed rather than surfaced as a merge failure.
pub async fn delete_branch(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    branch: &str,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/git/refs/heads/{branch}");
    let res = send_with_retry(gh.delete(&path)).await?;
    if res.status() == reqwest::StatusCode::UNPROCESSABLE_ENTITY {
        return Ok(());
    }
    check(res).await?;
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
) -> Result<Vec<PrFileEntry>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/files?per_page=100");
    let res = send_checked(gh.get(&path)).await?;
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

#[derive(Deserialize)]
struct ContentsResponse {
    content: String,
    encoding: String,
}

/// Fetches `path` as a `data:` URI at a specific commit via the Contents API, or `None` if it
/// didn't exist there (a 404 — added or deleted files only have one real side) or GitHub
/// returned something other than inline base64 (e.g. a file too large to inline).
async fn fetch_file_as_data_uri(
    gh: &GhClient,
    owner: &str,
    repo: &str,
    path: &str,
    git_ref: &str,
) -> Option<String> {
    let mut url =
        reqwest::Url::parse(&format!("{}/repos/{owner}/{repo}/contents/", gh.base)).ok()?;
    {
        let mut segments = url.path_segments_mut().ok()?;
        for part in path.split('/') {
            segments.push(part);
        }
    }
    url.query_pairs_mut().append_pair("ref", git_ref);

    let res = gh.http.get(url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let parsed: ContentsResponse = res.json().await.ok()?;
    if parsed.encoding != "base64" {
        return None;
    }
    let cleaned: String = parsed
        .content
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    Some(format!("data:{};base64,{cleaned}", mime_for(path)))
}

/// Image diff for a file changed in a PR — GitHub's PR-files `patch` text is empty for binary
/// files, so this goes through the Contents API directly at each side's commit instead.
pub async fn get_pull_request_image_diff(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    path: &str,
    base_sha: &str,
    head_sha: &str,
) -> Result<ImageDiff, String> {
    let gh = GhClient::new(host, token)?;
    let old = fetch_file_as_data_uri(&gh, owner, repo, path, base_sha).await;
    let new = fetch_file_as_data_uri(&gh, owner, repo, path, head_sha).await;
    Ok(ImageDiff { old, new })
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
        let Some(hunk) = hunks.last_mut() else {
            continue;
        };
        if let Some(content) = raw_line.strip_prefix('+') {
            hunk.lines.push(DiffLine {
                kind: LineKind::Addition,
                content: content.to_string(),
                old_lineno: None,
                new_lineno: Some(new_line),
                highlight_ranges: Vec::new(),
            });
            new_line += 1;
        } else if let Some(content) = raw_line.strip_prefix('-') {
            hunk.lines.push(DiffLine {
                kind: LineKind::Deletion,
                content: content.to_string(),
                old_lineno: Some(old_line),
                new_lineno: None,
                highlight_ranges: Vec::new(),
            });
            old_line += 1;
        } else {
            let content = raw_line.strip_prefix(' ').unwrap_or(raw_line);
            hunk.lines.push(DiffLine {
                kind: LineKind::Context,
                content: content.to_string(),
                old_lineno: Some(old_line),
                new_lineno: Some(new_line),
                highlight_ranges: Vec::new(),
            });
            old_line += 1;
            new_line += 1;
        }
    }
    crate::diff::add_intraline_highlights(&mut hunks);
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
    pub user_avatar_url: String,
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
            user_avatar_url: raw.user.avatar_url,
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
    let res = send_checked(gh.get(&path)).await?;
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
    let res = send_checked(gh.post(&url_path).json(&CreateReviewCommentBody {
        body,
        commit_id,
        path,
        line,
        side,
    }))
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
    let res = send_checked(gh.get(&path)).await?;
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
    let res = send_checked(gh.get(&path)).await?;
    let parsed: CommitDetailResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.commit.verification)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepoOwner {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepo {
    pub full_name: String,
    pub clone_url: String,
    pub description: Option<String>,
    pub private: bool,
    pub fork: bool,
    pub updated_at: String,
    pub owner: GitHubRepoOwner,
}

/// Lists the authenticated user's own repos, plus org repos they have access to, newest first —
/// backs the "browse your repos" clone picker.
pub async fn list_user_repos(host: &str, token: &str) -> Result<Vec<GitHubRepo>, String> {
    let gh = GhClient::new(host, token)?;
    let path =
        "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member";
    let res = send_checked(gh.get(path)).await?;
    res.json().await.map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
struct CreateRepoBody<'a> {
    name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<&'a str>,
    private: bool,
}

/// Creates a new repo under the authenticated user's own account (not an org) — backs the
/// "publish" flow for a local-only repo that doesn't have a remote yet.
pub async fn create_repo(
    host: &str,
    token: &str,
    name: &str,
    description: Option<&str>,
    private: bool,
) -> Result<GitHubRepo, String> {
    let gh = GhClient::new(host, token)?;
    let res = send_checked(gh.post("/user/repos").json(&CreateRepoBody {
        name,
        description,
        private,
    }))
    .await?;
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
