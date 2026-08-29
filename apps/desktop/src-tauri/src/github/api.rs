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
    // GitHub's list-pull-requests endpoint never populates any of these four (only
    // get-a-single-pull-request computes/includes them) — always empty/None from
    // `list_pull_requests`, populated from `get_pull_request`. See `usePullRequestMeta` on the
    // frontend, which exists specifically to re-fetch a single PR for this reason.
    #[serde(default)]
    pub mergeable_state: Option<String>,
    #[serde(default)]
    pub requested_reviewers: Vec<AssignableUser>,
    #[serde(default)]
    pub requested_teams: Vec<Team>,
    #[serde(default)]
    pub assignees: Vec<AssignableUser>,
    #[serde(default)]
    pub milestone: Option<Milestone>,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub active_lock_reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub slug: String,
    pub name: String,
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
    #[serde(default)]
    mergeable_state: Option<String>,
    #[serde(default)]
    requested_reviewers: Vec<AssignableUser>,
    #[serde(default)]
    requested_teams: Vec<Team>,
    #[serde(default)]
    assignees: Vec<AssignableUser>,
    #[serde(default)]
    milestone: Option<Milestone>,
    #[serde(default)]
    locked: bool,
    #[serde(default)]
    active_lock_reason: Option<String>,
    created_at: String,
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
            mergeable_state: raw.mergeable_state,
            requested_reviewers: raw.requested_reviewers,
            requested_teams: raw.requested_teams,
            assignees: raw.assignees,
            milestone: raw.milestone,
            locked: raw.locked,
            active_lock_reason: raw.active_lock_reason,
            created_at: raw.created_at,
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
struct RawRequiredStatusChecks {
    #[serde(default)]
    contexts: Vec<String>,
}

#[derive(Deserialize, Default)]
struct RawRequiredPullRequestReviews {
    #[serde(default)]
    required_approving_review_count: Option<u32>,
}

#[derive(Deserialize, Default)]
struct RawBranchProtection {
    #[serde(default)]
    required_linear_history: RawLinearHistorySetting,
    #[serde(default)]
    required_status_checks: RawRequiredStatusChecks,
    #[serde(default)]
    required_pull_request_reviews: RawRequiredPullRequestReviews,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BranchProtectionRequirements {
    pub required_contexts: Vec<String>,
    pub required_approving_review_count: Option<u32>,
}

/// Required status-check contexts and required-approving-review-count for `branch`, feeding the
/// Checks tab's required/optional grouping and the merge-readiness panel's "reviews met" check.
/// Best-effort like `requires_linear_history` above (reuses the same protection payload) — an
/// unprotected branch or a token without permission to view protection settings just means "no
/// requirements visible to us", not an error worth surfacing.
pub async fn branch_protection_requirements(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    branch: &str,
) -> BranchProtectionRequirements {
    let Ok(gh) = GhClient::new(host, token) else {
        return BranchProtectionRequirements::default();
    };
    let path = format!("/repos/{owner}/{repo}/branches/{branch}/protection");
    let Ok(res) = gh.get(&path).send().await else {
        return BranchProtectionRequirements::default();
    };
    if !res.status().is_success() {
        return BranchProtectionRequirements::default();
    }
    res.json::<RawBranchProtection>()
        .await
        .map(|p| BranchProtectionRequirements {
            required_contexts: p.required_status_checks.contexts,
            required_approving_review_count: p
                .required_pull_request_reviews
                .required_approving_review_count,
        })
        .unwrap_or_default()
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

#[derive(Debug, Serialize)]
struct UpdatePrBodyBody<'a> {
    body: &'a str,
}

/// Edits a PR's description — the author-only editing action in the Conversation tab.
pub async fn update_pull_request_body(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    body: &str,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}");
    send_checked(gh.patch(&path).json(&UpdatePrBodyBody { body })).await?;
    Ok(())
}

#[derive(Debug, Serialize)]
struct UpdatePrStateBody<'a> {
    state: &'a str,
}

/// Closes an open PR without merging it — GitHub's own "Close pull request" button is a single
/// click with no confirmation and stays reversible (a closed-but-unmerged PR can be reopened
/// from GitHub itself), so this mirrors that rather than adding an in-app confirm dialog.
pub async fn close_pull_request(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}");
    send_checked(gh.patch(&path).json(&UpdatePrStateBody { state: "closed" })).await?;
    Ok(())
}

/// Reopens a closed-but-unmerged PR — the symmetric counterpart to `close_pull_request`. GitHub
/// rejects this outright for an already-merged PR, so this is only ever wired up when the PR is
/// closed and not merged.
pub async fn reopen_pull_request(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}");
    send_checked(gh.patch(&path).json(&UpdatePrStateBody { state: "open" })).await?;
    Ok(())
}

#[derive(Debug, Serialize)]
struct LockBody<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    lock_reason: Option<&'a str>,
}

/// Locks the conversation — `lock_reason` is one of GitHub's four (`off-topic`, `too heated`,
/// `resolved`, `spam`) or `None` for "no reason given", both valid.
pub async fn lock_conversation(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    lock_reason: Option<&str>,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}/lock");
    send_checked(gh.put(&path).json(&LockBody { lock_reason })).await?;
    Ok(())
}

pub async fn unlock_conversation(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}/lock");
    send_checked(gh.delete(&path)).await?;
    Ok(())
}

/// Fast-forwards a PR's head branch onto its base — the "Update branch" action shown when the
/// merge-readiness panel reports `behind_by > 0`.
pub async fn update_pull_request_branch(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/update-branch");
    send_checked(gh.put(&path).json(&serde_json::json!({}))).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompareResult {
    pub ahead_by: u32,
    pub behind_by: u32,
    pub status: String,
}

/// How far `head` has diverged from `base` — GitHub's PR object itself carries no ahead/behind
/// counts, so the merge-readiness panel's "this branch is behind, Update branch" signal needs
/// its own request via the compare endpoint.
pub async fn compare_commits(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    base: &str,
    head: &str,
) -> Result<CompareResult, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/compare/{base}...{head}");
    let res = send_checked(gh.get(&path)).await?;
    res.json().await.map_err(|e| e.to_string())
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

/// Removes one label from an issue/PR — GitHub's label-removal endpoint is per-label
/// (`DELETE .../labels/{name}`, unlike the batch-add above), so the sidebar calls this once per
/// deselected label. A 404 (already removed, e.g. by someone else) is swallowed rather than
/// surfaced as an error.
pub async fn remove_label(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    name: &str,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let encoded_name = urlencode(name);
    let path = format!("/repos/{owner}/{repo}/issues/{number}/labels/{encoded_name}");
    let res = send_with_retry(gh.delete(&path)).await?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(());
    }
    check(res).await?;
    Ok(())
}

/// Percent-encodes a path segment (not a full URL) — used for label names, which can contain
/// spaces and other characters `format!` alone wouldn't escape.
fn urlencode(segment: &str) -> String {
    let mut url = reqwest::Url::parse("https://x/").expect("static base always parses");
    url.set_path(&format!("/{segment}"));
    url.path().trim_start_matches('/').to_string()
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

pub async fn remove_assignees(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    assignees: &[String],
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}/assignees");
    send_checked(gh.delete(&path).json(&AssigneesBody { assignees })).await?;
    Ok(())
}

#[derive(Debug, Serialize)]
struct ReviewersBody<'a> {
    reviewers: &'a [String],
    team_reviewers: &'a [String],
}

pub async fn request_reviewers(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    reviewers: &[String],
    team_reviewers: &[String],
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/requested_reviewers");
    send_checked(gh.post(&path).json(&ReviewersBody {
        reviewers,
        team_reviewers,
    }))
    .await?;
    Ok(())
}

pub async fn remove_requested_reviewers(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    reviewers: &[String],
    team_reviewers: &[String],
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/requested_reviewers");
    send_checked(gh.delete(&path).json(&ReviewersBody {
        reviewers,
        team_reviewers,
    }))
    .await?;
    Ok(())
}

/// Teams with review access to this repo — the candidate list for the sidebar's team-reviewer
/// picker, alongside `list_assignable_users`' individual reviewers.
pub async fn list_repo_teams(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
) -> Result<Vec<Team>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/teams?per_page=100");
    let res = send_checked(gh.get(&path)).await?;
    res.json().await.map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Milestone {
    pub number: u64,
    pub title: String,
    #[serde(default)]
    pub open_issues: u64,
    #[serde(default)]
    pub closed_issues: u64,
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

#[derive(Debug, Serialize)]
struct ClearMilestoneBody {
    milestone: Option<u64>,
}

/// Clears a PR's milestone — the sidebar's "Clear milestone" action in `SingleSelectField`.
pub async fn clear_milestone(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}");
    send_checked(
        gh.patch(&path)
            .json(&ClearMilestoneBody { milestone: None }),
    )
    .await?;
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

/// A PR's GraphQL node id — REST-only endpoints have no concept of this, so anything that needs
/// to reach the GraphQL-only surface (Projects v2, review-thread resolution, viewed-files) has to
/// look it up first. Shared by `add_pull_request_to_project`, `list_review_threads`/
/// `list_viewed_files`'s mutation counterparts below.
async fn pull_request_node_id(
    gh: &GhClient,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<String, String> {
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
    let data: NodeIdData = gh
        .graphql(
            PR_NODE_ID_QUERY,
            serde_json::json!({ "owner": owner, "repo": repo, "number": number }),
        )
        .await?;
    Ok(data.repository.pull_request.id)
}

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
    struct MutationData {
        #[allow(dead_code)]
        #[serde(rename = "addProjectV2ItemById")]
        add_project_v2_item_by_id: serde_json::Value,
    }

    let gh = GhClient::new(host, token)?;
    let content_id = pull_request_node_id(&gh, owner, repo, number).await?;
    let _: MutationData = gh
        .graphql(
            ADD_PROJECT_ITEM_MUTATION,
            serde_json::json!({ "projectId": project_id, "contentId": content_id }),
        )
        .await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewThread {
    pub id: String,
    pub is_resolved: bool,
    pub comment_database_ids: Vec<u64>,
}

const LIST_REVIEW_THREADS_QUERY: &str = r#"
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 100) { nodes { databaseId } }
        }
      }
    }
  }
}
"#;

/// Resolve/unresolve state per review-comment thread, joined back to REST comment ids via
/// `databaseId` (which GitHub's GraphQL layer defines to *be* the REST `id` for a
/// `PullRequestReviewComment` node) — the reconciliation itself happens on the frontend
/// (`useReviewThreads`), this just returns GitHub's thread shape as-is.
#[derive(Deserialize)]
struct ReviewThreadCommentNode {
    #[serde(rename = "databaseId")]
    database_id: Option<u64>,
}
#[derive(Deserialize)]
struct ReviewThreadCommentNodes {
    nodes: Vec<ReviewThreadCommentNode>,
}
#[derive(Deserialize)]
struct ReviewThreadNode {
    id: String,
    #[serde(rename = "isResolved")]
    is_resolved: bool,
    comments: ReviewThreadCommentNodes,
}
#[derive(Deserialize)]
struct ReviewThreadNodes {
    nodes: Vec<ReviewThreadNode>,
}
#[derive(Deserialize)]
struct ReviewThreadsPullRequestData {
    #[serde(rename = "reviewThreads")]
    review_threads: ReviewThreadNodes,
}
#[derive(Deserialize)]
struct ReviewThreadsRepositoryData {
    #[serde(rename = "pullRequest")]
    pull_request: ReviewThreadsPullRequestData,
}
#[derive(Deserialize)]
struct ReviewThreadsData {
    repository: ReviewThreadsRepositoryData,
}

impl From<ReviewThreadsData> for Vec<ReviewThread> {
    fn from(data: ReviewThreadsData) -> Self {
        data.repository
            .pull_request
            .review_threads
            .nodes
            .into_iter()
            .map(|t| ReviewThread {
                id: t.id,
                is_resolved: t.is_resolved,
                comment_database_ids: t
                    .comments
                    .nodes
                    .into_iter()
                    .filter_map(|c| c.database_id)
                    .collect(),
            })
            .collect()
    }
}

pub async fn list_review_threads(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<Vec<ReviewThread>, String> {
    let gh = GhClient::new(host, token)?;
    let data: ReviewThreadsData = gh
        .graphql(
            LIST_REVIEW_THREADS_QUERY,
            serde_json::json!({ "owner": owner, "repo": repo, "number": number }),
        )
        .await?;
    Ok(data.into())
}

const RESOLVE_THREAD_MUTATION: &str = r#"
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) { thread { id } }
}
"#;

const UNRESOLVE_THREAD_MUTATION: &str = r#"
mutation($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) { thread { id } }
}
"#;

pub async fn resolve_review_thread(host: &str, token: &str, thread_id: &str) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let _: serde_json::Value = gh
        .graphql(
            RESOLVE_THREAD_MUTATION,
            serde_json::json!({ "threadId": thread_id }),
        )
        .await?;
    Ok(())
}

pub async fn unresolve_review_thread(
    host: &str,
    token: &str,
    thread_id: &str,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let _: serde_json::Value = gh
        .graphql(
            UNRESOLVE_THREAD_MUTATION,
            serde_json::json!({ "threadId": thread_id }),
        )
        .await?;
    Ok(())
}

const LIST_VIEWED_FILES_QUERY: &str = r#"
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      files(first: 100) {
        nodes { path viewerViewedState }
      }
    }
  }
}
"#;

/// Per-viewer "marked as viewed" state per file path — deliberately never written to the SQLite
/// mirror (see `pr_cache.rs`), always fetched live: it's per-viewer, cheap to refetch, and wrong
/// if stale in a way that actively misleads (looking un-viewed right after you viewed it, or
/// vice versa after a rebase).
#[derive(Deserialize)]
struct ViewedFileNode {
    path: String,
    #[serde(rename = "viewerViewedState")]
    viewer_viewed_state: String,
}
#[derive(Deserialize)]
struct ViewedFileNodes {
    nodes: Vec<ViewedFileNode>,
}
#[derive(Deserialize)]
struct ViewedFilesPullRequestData {
    files: ViewedFileNodes,
}
#[derive(Deserialize)]
struct ViewedFilesRepositoryData {
    #[serde(rename = "pullRequest")]
    pull_request: ViewedFilesPullRequestData,
}
#[derive(Deserialize)]
struct ViewedFilesData {
    repository: ViewedFilesRepositoryData,
}

impl From<ViewedFilesData> for Vec<(String, String)> {
    fn from(data: ViewedFilesData) -> Self {
        data.repository
            .pull_request
            .files
            .nodes
            .into_iter()
            .map(|f| (f.path, f.viewer_viewed_state))
            .collect()
    }
}

pub async fn list_viewed_files(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<Vec<(String, String)>, String> {
    let gh = GhClient::new(host, token)?;
    let data: ViewedFilesData = gh
        .graphql(
            LIST_VIEWED_FILES_QUERY,
            serde_json::json!({ "owner": owner, "repo": repo, "number": number }),
        )
        .await?;
    Ok(data.into())
}

const MARK_FILE_VIEWED_MUTATION: &str = r#"
mutation($pullRequestId: ID!, $path: String!) {
  markFileAsViewed(input: { pullRequestId: $pullRequestId, path: $path }) { clientMutationId }
}
"#;

const UNMARK_FILE_VIEWED_MUTATION: &str = r#"
mutation($pullRequestId: ID!, $path: String!) {
  unmarkFileAsViewed(input: { pullRequestId: $pullRequestId, path: $path }) { clientMutationId }
}
"#;

pub async fn mark_file_as_viewed(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    path: &str,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let pr_id = pull_request_node_id(&gh, owner, repo, number).await?;
    let _: serde_json::Value = gh
        .graphql(
            MARK_FILE_VIEWED_MUTATION,
            serde_json::json!({ "pullRequestId": pr_id, "path": path }),
        )
        .await?;
    Ok(())
}

pub async fn unmark_file_as_viewed(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    path: &str,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let pr_id = pull_request_node_id(&gh, owner, repo, number).await?;
    let _: serde_json::Value = gh
        .graphql(
            UNMARK_FILE_VIEWED_MUTATION,
            serde_json::json!({ "pullRequestId": pr_id, "path": path }),
        )
        .await?;
    Ok(())
}

/// Open/closed state for a batch of issue numbers in one request (aliased per-number, since
/// GraphQL has no "issue by number, list of numbers" batch field) — feeds the sidebar's linked-
/// issues chips ("Closes #123" parsed out of the PR body).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueSummary {
    pub number: u64,
    pub title: String,
    pub state: String,
}

#[derive(Deserialize)]
struct RawIssueSummary {
    number: u64,
    title: String,
    state: String,
    // Present (non-null) only when this "issue" is actually a pull request — GitHub's issues
    // endpoint returns both, unfiltered.
    #[serde(default)]
    pull_request: Option<serde_json::Value>,
}

/// Every issue in the repo (open and closed, PRs excluded) — the candidate list for the
/// sidebar's/create-PR dialog's "link an issue" picker. A lean single page rather than full
/// pagination: a repo with more than 100 issues just won't show every one of them in this
/// picker, same "rare edge case" call already made for other option lists in this app.
pub async fn list_repo_issues(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
) -> Result<Vec<IssueSummary>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues?state=all&per_page=100");
    let res = send_checked(gh.get(&path)).await?;
    let raw: Vec<RawIssueSummary> = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw
        .into_iter()
        .filter(|i| i.pull_request.is_none())
        .map(|i| IssueSummary {
            number: i.number,
            title: i.title,
            state: i.state,
        })
        .collect())
}

pub async fn list_issue_states(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    numbers: &[u64],
) -> Result<std::collections::HashMap<u64, String>, String> {
    if numbers.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    let fields: Vec<String> = numbers
        .iter()
        .map(|n| format!(r#"i{n}: issue(number: {n}) {{ number state }}"#))
        .collect();
    let query = format!(
        r#"query($owner: String!, $repo: String!) {{
          repository(owner: $owner, name: $repo) {{ {} }}
        }}"#,
        fields.join("\n")
    );

    #[derive(Deserialize)]
    struct IssueNode {
        number: u64,
        state: String,
    }

    let gh = GhClient::new(host, token)?;
    let data: serde_json::Value = gh
        .graphql(&query, serde_json::json!({ "owner": owner, "repo": repo }))
        .await?;
    let repository = data.get("repository").cloned().unwrap_or_default();
    let mut result = std::collections::HashMap::new();
    if let serde_json::Value::Object(fields) = repository {
        for (_, value) in fields {
            if value.is_null() {
                continue;
            }
            if let Ok(node) = serde_json::from_value::<IssueNode>(value) {
                result.insert(node.number, node.state);
            }
        }
    }
    Ok(result)
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

#[derive(Deserialize)]
struct RawCommitIdentity {
    name: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize)]
struct RawCommitInner {
    author: Option<RawCommitIdentity>,
    message: String,
}

#[derive(Deserialize)]
struct RawPullRequestCommit {
    commit: RawCommitInner,
    // The linked GitHub account for this commit, already resolved by GitHub itself (including
    // via noreply emails) — null when the commit's author has no linked/matchable account.
    author: Option<RawUser>,
}

async fn list_pull_request_commits(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<Vec<RawPullRequestCommit>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/commits?per_page=100");
    let res = send_checked(gh.get(&path)).await?;
    res.json().await.map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestCommit {
    pub sha: String,
    pub summary: String,
    pub body: String,
    pub author_login: Option<String>,
    pub author_avatar_url: Option<String>,
    pub author_name: Option<String>,
    pub author_email: Option<String>,
    pub authored_at: Option<String>,
    pub html_url: String,
}

#[derive(Deserialize)]
struct RawPullRequestCommitEntry {
    sha: String,
    commit: RawCommitDetail,
    author: Option<RawUser>,
    html_url: String,
}

#[derive(Deserialize)]
struct RawCommitDetail {
    message: String,
    author: Option<RawCommitAuthorDetail>,
}

#[derive(Deserialize)]
struct RawCommitAuthorDetail {
    name: Option<String>,
    email: Option<String>,
    date: Option<String>,
}

impl From<RawPullRequestCommitEntry> for PullRequestCommit {
    fn from(raw: RawPullRequestCommitEntry) -> Self {
        let mut lines = raw.commit.message.splitn(2, '\n');
        let summary = lines.next().unwrap_or_default().to_string();
        let body = lines
            .next()
            .unwrap_or_default()
            .trim_start_matches('\n')
            .to_string();
        PullRequestCommit {
            sha: raw.sha,
            summary,
            body,
            author_login: raw.author.as_ref().map(|a| a.login.clone()),
            author_avatar_url: raw.author.as_ref().map(|a| a.avatar_url.clone()),
            author_name: raw.commit.author.as_ref().and_then(|a| a.name.clone()),
            author_email: raw.commit.author.as_ref().and_then(|a| a.email.clone()),
            authored_at: raw.commit.author.and_then(|a| a.date),
            html_url: raw.html_url,
        }
    }
}

/// Commits belonging to a PR, for the Commits tab — one page (GitHub's max `per_page=100`) at a
/// time; the frontend pages through via `useInfiniteQuery` the same way `list_pull_requests`
/// already does for the PR list itself.
pub async fn list_pull_request_commits_for_display(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    page: u32,
) -> Result<Vec<PullRequestCommit>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/commits?per_page=100&page={page}");
    let res = send_checked(gh.get(&path)).await?;
    let raw: Vec<RawPullRequestCommitEntry> = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into_iter().map(PullRequestCommit::from).collect())
}

#[derive(Deserialize)]
struct RawCommitDetailResponse {
    files: Vec<RawPullRequestFile>,
}

/// File-level diff for an arbitrary commit sha (used by the Commits tab, where a clicked commit
/// may not exist in the local git repo at all) — reuses `parse_patch` exactly like
/// `list_pull_request_files` since a single commit's `files[].patch` has the same unified-diff
/// shape as a PR's aggregate file list.
pub async fn get_commit_diff_files(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    sha: &str,
) -> Result<Vec<PrFileEntry>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/commits/{sha}");
    let res = send_checked(gh.get(&path)).await?;
    let raw: RawCommitDetailResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw
        .files
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

const COAUTHOR_PREFIX: &str = "co-authored-by:";

fn strip_coauthor_trailers(message: &str) -> String {
    message
        .lines()
        .filter(|line| !line.trim().to_lowercase().starts_with(COAUTHOR_PREFIX))
        .collect::<Vec<_>>()
        .join("\n")
        .trim_end()
        .to_string()
}

/// GitHub's default squash-merge commit message credits every squashed commit's author as a
/// `Co-authored-by` trailer — including the person doing the merge, so a branch with only one
/// contributor still shows that same person as both author and co-author of the squash commit
/// (a long-standing GitHub limitation: https://github.com/orgs/community/discussions/33311).
/// We build the message ourselves instead of leaving `commit_message` unset, so the merging user
/// is never listed as their own co-author, while other contributors still get credited.
fn build_squash_commit_message(commits: &[RawPullRequestCommit], merger_login: &str) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut coauthors = Vec::new();
    for c in commits {
        let is_merger = c
            .author
            .as_ref()
            .map(|a| a.login.eq_ignore_ascii_case(merger_login))
            .unwrap_or(false);
        if is_merger {
            continue;
        }
        let Some(identity) = &c.commit.author else {
            continue;
        };
        let (Some(name), Some(email)) = (identity.name.as_deref(), identity.email.as_deref())
        else {
            continue;
        };
        if seen.insert(email.to_lowercase()) {
            coauthors.push(format!("Co-authored-by: {name} <{email}>"));
        }
    }

    let body = if commits.len() == 1 {
        strip_coauthor_trailers(&commits[0].commit.message)
    } else {
        commits
            .iter()
            .map(|c| format!("* {}", c.commit.message.lines().next().unwrap_or("")))
            .collect::<Vec<_>>()
            .join("\n")
    };

    if coauthors.is_empty() {
        body
    } else {
        format!("{body}\n\n{}", coauthors.join("\n"))
    }
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
    merger_login: &str,
    merge_method: &str,
    commit_title: Option<&str>,
    commit_message: Option<&str>,
    sha: Option<&str>,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;

    // Only squash merges are affected (merge commits and rebase merges keep each original
    // commit's own author, so GitHub never synthesizes a co-author trailer for them) — and only
    // when the user left the message blank, i.e. they want GitHub's default rather than something
    // they typed themselves.
    let computed_message;
    let commit_message = if merge_method == "squash" && commit_message.is_none() {
        match list_pull_request_commits(host, token, owner, repo, number).await {
            Ok(commits) => {
                computed_message = build_squash_commit_message(&commits, merger_login);
                Some(computed_message.as_str())
            }
            Err(_) => commit_message,
        }
    } else {
        commit_message
    };

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

#[derive(Debug, Serialize)]
struct ReplyToReviewCommentBody<'a> {
    body: &'a str,
    in_reply_to: u64,
}

/// Replies within an existing review-comment thread — GitHub's reply variant of the same
/// endpoint `create_review_comment` posts to, just with `in_reply_to` instead of a
/// path/line/side (both inherited from the comment being replied to).
pub async fn reply_to_review_comment(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    in_reply_to: u64,
    body: &str,
) -> Result<ReviewComment, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/comments");
    let res = send_checked(
        gh.post(&path)
            .json(&ReplyToReviewCommentBody { body, in_reply_to }),
    )
    .await?;
    let raw: RawReviewComment = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into())
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
pub struct IssueComment {
    pub id: u64,
    pub body: String,
    pub user_login: String,
    pub user_avatar_url: String,
    pub created_at: String,
    pub updated_at: String,
    pub html_url: String,
}

#[derive(Deserialize)]
struct RawIssueComment {
    id: u64,
    body: String,
    user: RawUser,
    created_at: String,
    updated_at: String,
    html_url: String,
}

impl From<RawIssueComment> for IssueComment {
    fn from(raw: RawIssueComment) -> Self {
        IssueComment {
            id: raw.id,
            body: raw.body,
            user_login: raw.user.login,
            user_avatar_url: raw.user.avatar_url,
            created_at: raw.created_at,
            updated_at: raw.updated_at,
            html_url: raw.html_url,
        }
    }
}

/// Top-level (issue-style) comments on a PR — distinct from `list_review_comments`'s
/// line-anchored diff comments. Feeds the Conversation tab's timeline.
#[derive(Deserialize)]
struct RawTimelineLabel {
    name: String,
    color: String,
}

#[derive(Deserialize)]
struct RawTimelineEvent {
    #[serde(default)]
    id: Option<u64>,
    event: String,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    actor: Option<RawUser>,
    #[serde(default)]
    label: Option<RawTimelineLabel>,
    #[serde(default)]
    assignee: Option<RawUser>,
    #[serde(default)]
    requested_reviewer: Option<RawUser>,
    /// Only present on a `connected` event — GitHub's real field name for the linked issue/PR
    /// is `subject`, not `source` (that name, and the `cross-referenced` event kind, describe a
    /// different, far noisier concept: "something else mentions this issue/PR", which fires for
    /// any plain mention, not a closing keyword). Verified against a live `connected` event's
    /// JSON shape on this repo's own PR #81 (linked to issue #38 via `Closes #38`).
    #[serde(default)]
    subject: Option<RawConnectedSubject>,
}

#[derive(Deserialize)]
struct RawConnectedSubject {
    number: u64,
    title: String,
    state: String,
    #[serde(default)]
    repository: Option<RawRepoRef>,
}

#[derive(Deserialize)]
struct RawRepoRef {
    full_name: String,
    #[serde(default)]
    html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueTimelineEvent {
    pub id: Option<u64>,
    pub event: String,
    pub created_at: Option<String>,
    pub actor_login: Option<String>,
    pub actor_avatar_url: Option<String>,
    pub label_name: Option<String>,
    pub label_color: Option<String>,
    pub assignee_login: Option<String>,
    pub assignee_avatar_url: Option<String>,
    pub requested_reviewer_login: Option<String>,
    pub requested_reviewer_avatar_url: Option<String>,
    /// Populated only for a `connected` event — the "X linked an issue that may be closed by
    /// this pull request" line. GitHub creates this event specifically for the closing-keyword
    /// (or manual Development-panel) link, so unlike `cross-referenced` it never fires for a
    /// plain mention — no extra client-side filtering against the PR body needed.
    pub source_issue_number: Option<u64>,
    pub source_issue_title: Option<String>,
    pub source_issue_state: Option<String>,
    pub source_issue_html_url: Option<String>,
    pub source_issue_repo_full_name: Option<String>,
}

impl From<RawTimelineEvent> for IssueTimelineEvent {
    fn from(raw: RawTimelineEvent) -> Self {
        let subject = raw.subject;
        let repo = subject.as_ref().and_then(|s| s.repository.as_ref());
        let html_url = subject
            .as_ref()
            .zip(repo)
            .map(|(s, r)| format!("{}/issues/{}", r.html_url, s.number));
        IssueTimelineEvent {
            id: raw.id,
            event: raw.event,
            created_at: raw.created_at,
            actor_login: raw.actor.as_ref().map(|a| a.login.clone()),
            actor_avatar_url: raw.actor.map(|a| a.avatar_url),
            label_name: raw.label.as_ref().map(|l| l.name.clone()),
            label_color: raw.label.map(|l| l.color),
            assignee_login: raw.assignee.as_ref().map(|a| a.login.clone()),
            assignee_avatar_url: raw.assignee.map(|a| a.avatar_url),
            requested_reviewer_login: raw.requested_reviewer.as_ref().map(|a| a.login.clone()),
            requested_reviewer_avatar_url: raw.requested_reviewer.map(|a| a.avatar_url),
            source_issue_number: subject.as_ref().map(|s| s.number),
            source_issue_title: subject.as_ref().map(|s| s.title.clone()),
            source_issue_state: subject.as_ref().map(|s| s.state.clone()),
            source_issue_html_url: html_url,
            source_issue_repo_full_name: repo.map(|r| r.full_name.clone()),
        }
    }
}

/// The event kinds the Conversation tab's timeline renders — everything else GitHub's timeline
/// API returns (commented/committed/reviewed/etc.) is already covered by our own issue-
/// comments/reviews/commits fetches, so including them here would just duplicate entries rather
/// than add information. `connected` is the exception: it's the only way to get "X linked an
/// issue that may be closed by this pull request" (verified against a live event on this repo's
/// own PR #81 — GitHub uses `connected`/`subject`, not the more commonly-guessed
/// `cross-referenced`/`source`, for this specific line).
const RELEVANT_TIMELINE_EVENTS: &[&str] = &[
    "labeled",
    "unlabeled",
    "assigned",
    "unassigned",
    "review_requested",
    "review_request_removed",
    "closed",
    "reopened",
    "merged",
    "connected",
];

/// Label/assignee/reviewer-request/close/reopen/merge events for the Conversation tab's
/// timeline — GitHub's PR object itself carries none of this history, only the issue timeline
/// endpoint does. Deliberately not written to the SQLite mirror (unlike issue comments/reviews):
/// this is supplementary history, not core review content, and keeping it simple (always live,
/// no offline fallback) avoids one more cache table for a feature that degrades gracefully to
/// "timeline just shows comments/reviews/commits" if the fetch fails.
pub async fn list_relevant_timeline_events(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<Vec<IssueTimelineEvent>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}/timeline?per_page=100");
    let res = send_checked(gh.get(&path)).await?;
    let raw: Vec<RawTimelineEvent> = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw
        .into_iter()
        .filter(|e| RELEVANT_TIMELINE_EVENTS.contains(&e.event.as_str()))
        .map(IssueTimelineEvent::from)
        .collect())
}

pub async fn list_issue_comments(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    page: u32,
) -> Result<Vec<IssueComment>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}/comments?per_page=100&page={page}");
    let res = send_checked(gh.get(&path)).await?;
    let raw: Vec<RawIssueComment> = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into_iter().map(IssueComment::from).collect())
}

#[derive(Debug, Serialize)]
struct CreateIssueCommentBody<'a> {
    body: &'a str,
}

pub async fn create_issue_comment(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    body: &str,
) -> Result<IssueComment, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues/{number}/comments");
    let res = send_checked(gh.post(&path).json(&CreateIssueCommentBody { body })).await?;
    let raw: RawIssueComment = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into())
}

pub async fn delete_issue_comment(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    comment_id: u64,
) -> Result<(), String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/issues/comments/{comment_id}");
    send_checked(gh.delete(&path)).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Review {
    pub id: u64,
    pub user_login: String,
    pub user_avatar_url: String,
    pub state: String,
    pub body: String,
    pub submitted_at: Option<String>,
    pub html_url: String,
}

#[derive(Deserialize)]
struct RawReview {
    id: u64,
    user: RawUser,
    state: String,
    #[serde(default)]
    body: String,
    submitted_at: Option<String>,
    #[serde(default)]
    html_url: String,
}

impl From<RawReview> for Review {
    fn from(raw: RawReview) -> Self {
        Review {
            id: raw.id,
            user_login: raw.user.login,
            user_avatar_url: raw.user.avatar_url,
            state: raw.state,
            body: raw.body,
            submitted_at: raw.submitted_at,
            html_url: raw.html_url,
        }
    }
}

/// Review submissions (approve/request-changes/comment) on a PR — per-reviewer status shown in
/// the sidebar is derived client-side from this plus the PR's `requested_reviewers`, not a
/// separate endpoint.
pub async fn list_reviews(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    page: u32,
) -> Result<Vec<Review>, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/reviews?per_page=100&page={page}");
    let res = send_checked(gh.get(&path)).await?;
    let raw: Vec<RawReview> = res.json().await.map_err(|e| e.to_string())?;
    Ok(raw.into_iter().map(Review::from).collect())
}

#[derive(Debug, Serialize)]
struct SubmitReviewBody<'a> {
    event: &'a str,
    #[serde(skip_serializing_if = "str::is_empty")]
    body: &'a str,
}

/// Submits a review — `event` is one of `APPROVE`, `REQUEST_CHANGES`, `COMMENT`.
pub async fn submit_review(
    host: &str,
    token: &str,
    owner: &str,
    repo: &str,
    number: u64,
    event: &str,
    body: &str,
) -> Result<Review, String> {
    let gh = GhClient::new(host, token)?;
    let path = format!("/repos/{owner}/{repo}/pulls/{number}/reviews");
    let res = send_checked(gh.post(&path).json(&SubmitReviewBody { event, body })).await?;
    let raw: RawReview = res.json().await.map_err(|e| e.to_string())?;
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

    fn commit(login: Option<&str>, name: &str, email: &str, message: &str) -> RawPullRequestCommit {
        RawPullRequestCommit {
            commit: RawCommitInner {
                author: Some(RawCommitIdentity {
                    name: Some(name.to_string()),
                    email: Some(email.to_string()),
                }),
                message: message.to_string(),
            },
            author: login.map(|l| RawUser {
                login: l.to_string(),
                avatar_url: String::new(),
            }),
        }
    }

    #[test]
    fn squash_message_omits_merger_as_their_own_coauthor() {
        let commits = vec![
            commit(
                Some("daniel"),
                "Daniel",
                "daniel@example.com",
                "First commit",
            ),
            commit(
                Some("daniel"),
                "Daniel",
                "daniel@example.com",
                "Second commit",
            ),
        ];
        let message = build_squash_commit_message(&commits, "daniel");
        assert!(!message.to_lowercase().contains("co-authored-by"));
    }

    #[test]
    fn squash_message_keeps_a_genuinely_different_coauthor() {
        let commits = vec![
            commit(
                Some("daniel"),
                "Daniel",
                "daniel@example.com",
                "First commit",
            ),
            commit(
                Some("helper"),
                "Helper",
                "helper@example.com",
                "Second commit",
            ),
        ];
        let message = build_squash_commit_message(&commits, "daniel");
        assert_eq!(
            message,
            "* First commit\n* Second commit\n\nCo-authored-by: Helper <helper@example.com>"
        );
    }

    #[test]
    fn squash_message_dedupes_same_coauthor_across_commits() {
        let commits = vec![
            commit(
                Some("helper"),
                "Helper",
                "helper@example.com",
                "First commit",
            ),
            commit(
                Some("helper"),
                "Helper",
                "helper@example.com",
                "Second commit",
            ),
        ];
        let message = build_squash_commit_message(&commits, "daniel");
        assert_eq!(message.matches("Co-authored-by").count(), 1);
    }

    #[test]
    fn squash_message_for_single_commit_strips_its_own_self_coauthor_trailer() {
        let commits = vec![commit(
            Some("daniel"),
            "Daniel",
            "daniel@example.com",
            "Add feature\n\nCo-authored-by: Daniel <daniel@example.com>",
        )];
        let message = build_squash_commit_message(&commits, "daniel");
        assert_eq!(message, "Add feature");
    }

    #[test]
    fn strip_coauthor_trailers_removes_only_trailer_lines() {
        let stripped = strip_coauthor_trailers(
            "Summary\n\nBody line.\nCo-authored-by: Someone <s@example.com>",
        );
        assert_eq!(stripped, "Summary\n\nBody line.");
    }

    fn raw_pull_request_json(extra: &str) -> String {
        format!(
            r#"{{
                "number": 1, "title": "t", "body": null, "state": "open", "draft": false,
                "html_url": "https://github.com/o/r/pull/1",
                "user": {{"login": "alice", "avatar_url": "https://a"}},
                "head": {{"ref": "feature", "sha": "abc"}},
                "base": {{"ref": "main", "sha": "def"}},
                "merged_at": null, "mergeable": null, "labels": [],
                "created_at": "2024-01-01T00:00:00Z"
                {extra}
            }}"#
        )
    }

    #[test]
    fn pull_request_maps_get_single_pr_fields_when_present() {
        let json = raw_pull_request_json(
            r#",
            "mergeable_state": "clean",
            "requested_reviewers": [{"login": "bob", "avatar_url": "https://b"}],
            "requested_teams": [{"slug": "backend", "name": "Backend"}],
            "assignees": [{"login": "carol", "avatar_url": "https://c"}],
            "milestone": {"number": 3, "title": "v1", "open_issues": 2, "closed_issues": 1},
            "locked": true,
            "active_lock_reason": "too heated"
            "#,
        );
        let raw: RawPullRequest = serde_json::from_str(&json).unwrap();
        let pr: PullRequest = raw.into();
        assert_eq!(pr.mergeable_state, Some("clean".to_string()));
        assert_eq!(pr.requested_reviewers.len(), 1);
        assert_eq!(pr.requested_reviewers[0].login, "bob");
        assert_eq!(pr.requested_teams.len(), 1);
        assert_eq!(pr.requested_teams[0].slug, "backend");
        assert_eq!(pr.assignees.len(), 1);
        assert_eq!(pr.assignees[0].login, "carol");
        assert_eq!(pr.milestone.as_ref().unwrap().title, "v1");
        assert!(pr.locked);
        assert_eq!(pr.active_lock_reason, Some("too heated".to_string()));
    }

    #[test]
    fn pull_request_defaults_get_single_pr_fields_when_absent_like_list_prs_response() {
        // GitHub's list-pull-requests endpoint never returns these four fields at all — this
        // must still deserialize cleanly via #[serde(default)] rather than failing.
        let json = raw_pull_request_json("");
        let raw: RawPullRequest = serde_json::from_str(&json).unwrap();
        let pr: PullRequest = raw.into();
        assert_eq!(pr.mergeable_state, None);
        assert!(pr.requested_reviewers.is_empty());
        assert!(pr.requested_teams.is_empty());
        assert!(pr.assignees.is_empty());
        assert!(pr.milestone.is_none());
        assert!(!pr.locked);
        assert_eq!(pr.active_lock_reason, None);
    }

    #[test]
    fn pull_request_commit_splits_summary_and_body_and_maps_author() {
        let json = r#"{
            "sha": "abc123",
            "commit": {
                "message": "Fix bug\n\nLonger explanation here.",
                "author": {"name": "Alice", "email": "alice@example.com", "date": "2024-01-01T00:00:00Z"}
            },
            "author": {"login": "alice", "avatar_url": "https://a"},
            "html_url": "https://github.com/o/r/commit/abc123"
        }"#;
        let raw: RawPullRequestCommitEntry = serde_json::from_str(json).unwrap();
        let commit: PullRequestCommit = raw.into();
        assert_eq!(commit.summary, "Fix bug");
        assert_eq!(commit.body, "Longer explanation here.");
        assert_eq!(commit.author_login, Some("alice".to_string()));
        assert_eq!(commit.author_email, Some("alice@example.com".to_string()));
    }

    #[test]
    fn pull_request_commit_with_no_body_has_empty_body() {
        let json = r#"{
            "sha": "abc123",
            "commit": {"message": "Just a summary", "author": null},
            "author": null,
            "html_url": "https://github.com/o/r/commit/abc123"
        }"#;
        let raw: RawPullRequestCommitEntry = serde_json::from_str(json).unwrap();
        let commit: PullRequestCommit = raw.into();
        assert_eq!(commit.summary, "Just a summary");
        assert_eq!(commit.body, "");
        assert_eq!(commit.author_login, None);
    }

    #[test]
    fn compare_result_parses_ahead_behind_status() {
        let json = r#"{"ahead_by": 2, "behind_by": 5, "status": "diverged"}"#;
        let parsed: CompareResult = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.ahead_by, 2);
        assert_eq!(parsed.behind_by, 5);
        assert_eq!(parsed.status, "diverged");
    }

    #[test]
    fn branch_protection_captures_required_contexts_and_review_count() {
        let json = r#"{
            "required_linear_history": {"enabled": true},
            "required_status_checks": {"contexts": ["ci/build", "ci/test"]},
            "required_pull_request_reviews": {"required_approving_review_count": 2}
        }"#;
        let parsed: RawBranchProtection = serde_json::from_str(json).unwrap();
        assert!(parsed.required_linear_history.enabled);
        assert_eq!(
            parsed.required_status_checks.contexts,
            vec!["ci/build", "ci/test"]
        );
        assert_eq!(
            parsed
                .required_pull_request_reviews
                .required_approving_review_count,
            Some(2)
        );
    }

    #[test]
    fn branch_protection_defaults_when_fields_absent() {
        let parsed: RawBranchProtection = serde_json::from_str("{}").unwrap();
        assert!(!parsed.required_linear_history.enabled);
        assert!(parsed.required_status_checks.contexts.is_empty());
        assert_eq!(
            parsed
                .required_pull_request_reviews
                .required_approving_review_count,
            None
        );
    }

    #[test]
    fn review_threads_response_joins_database_ids_and_resolved_state() {
        let json = r#"{
            "repository": {
                "pullRequest": {
                    "reviewThreads": {
                        "nodes": [
                            {
                                "id": "thread1",
                                "isResolved": true,
                                "comments": {"nodes": [{"databaseId": 111}, {"databaseId": 222}]}
                            },
                            {
                                "id": "thread2",
                                "isResolved": false,
                                "comments": {"nodes": [{"databaseId": 333}]}
                            }
                        ]
                    }
                }
            }
        }"#;
        let data: ReviewThreadsData = serde_json::from_str(json).unwrap();
        let threads: Vec<ReviewThread> = data.into();
        assert_eq!(threads.len(), 2);
        assert!(threads[0].is_resolved);
        assert_eq!(threads[0].comment_database_ids, vec![111, 222]);
        assert!(!threads[1].is_resolved);
    }

    #[test]
    fn viewed_files_response_maps_path_to_viewer_state() {
        let json = r#"{
            "repository": {
                "pullRequest": {
                    "files": {
                        "nodes": [
                            {"path": "src/a.rs", "viewerViewedState": "VIEWED"},
                            {"path": "src/b.rs", "viewerViewedState": "UNVIEWED"}
                        ]
                    }
                }
            }
        }"#;
        let data: ViewedFilesData = serde_json::from_str(json).unwrap();
        let files: Vec<(String, String)> = data.into();
        assert_eq!(
            files,
            vec![
                ("src/a.rs".to_string(), "VIEWED".to_string()),
                ("src/b.rs".to_string(), "UNVIEWED".to_string()),
            ]
        );
    }

    #[test]
    fn raw_issue_summary_excludes_entries_that_are_actually_pull_requests() {
        let json = r#"[
            {"number": 1, "title": "A real issue", "state": "open"},
            {"number": 2, "title": "Actually a PR", "state": "open", "pull_request": {"url": "https://x"}}
        ]"#;
        let raw: Vec<RawIssueSummary> = serde_json::from_str(json).unwrap();
        let filtered: Vec<IssueSummary> = raw
            .into_iter()
            .filter(|i| i.pull_request.is_none())
            .map(|i| IssueSummary {
                number: i.number,
                title: i.title,
                state: i.state,
            })
            .collect();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].number, 1);
    }

    #[test]
    fn timeline_event_maps_labeled_event_fields() {
        let json = r#"{
            "id": 1,
            "event": "labeled",
            "created_at": "2024-01-01T00:00:00Z",
            "actor": {"login": "alice", "avatar_url": "https://a"},
            "label": {"name": "bug", "color": "d73a4a"}
        }"#;
        let raw: RawTimelineEvent = serde_json::from_str(json).unwrap();
        let event: IssueTimelineEvent = raw.into();
        assert_eq!(event.event, "labeled");
        assert_eq!(event.actor_login, Some("alice".to_string()));
        assert_eq!(event.label_name, Some("bug".to_string()));
        assert_eq!(event.label_color, Some("d73a4a".to_string()));
    }

    #[test]
    fn timeline_event_maps_review_requested_event_fields() {
        let json = r#"{
            "event": "review_requested",
            "actor": {"login": "alice", "avatar_url": "https://a"},
            "requested_reviewer": {"login": "bob", "avatar_url": "https://b"}
        }"#;
        let raw: RawTimelineEvent = serde_json::from_str(json).unwrap();
        let event: IssueTimelineEvent = raw.into();
        assert_eq!(event.id, None);
        assert_eq!(event.requested_reviewer_login, Some("bob".to_string()));
        assert_eq!(event.label_name, None);
    }

    #[test]
    fn timeline_event_maps_connected_subject_fields() {
        // Shape verified against a live `connected` event from this repo's own PR #81 (linked
        // to issue #38 via `Closes #38`) — GitHub's real field names are `subject`/`connected`,
        // not the more commonly-guessed `source`/`cross-referenced`.
        let json = r#"{
            "event": "connected",
            "actor": {"login": "alice", "avatar_url": "https://a"},
            "subject": {
                "number": 24,
                "title": "Fix the thing",
                "state": "open",
                "repository": {"full_name": "Daanieeel/gitbud", "html_url": "https://github.com/Daanieeel/gitbud"}
            }
        }"#;
        let raw: RawTimelineEvent = serde_json::from_str(json).unwrap();
        let event: IssueTimelineEvent = raw.into();
        assert_eq!(event.source_issue_number, Some(24));
        assert_eq!(event.source_issue_title, Some("Fix the thing".to_string()));
        assert_eq!(event.source_issue_state, Some("open".to_string()));
        assert_eq!(
            event.source_issue_html_url,
            Some("https://github.com/Daanieeel/gitbud/issues/24".to_string())
        );
        assert_eq!(
            event.source_issue_repo_full_name,
            Some("Daanieeel/gitbud".to_string())
        );
    }

    #[test]
    fn timeline_event_leaves_source_issue_fields_none_for_other_event_kinds() {
        let json = r#"{"event": "labeled", "label": {"name": "bug", "color": "d73a4a"}}"#;
        let raw: RawTimelineEvent = serde_json::from_str(json).unwrap();
        let event: IssueTimelineEvent = raw.into();
        assert_eq!(event.source_issue_number, None);
    }

    #[test]
    fn relevant_timeline_events_excludes_comment_and_review_kinds() {
        // These are already covered by list_issue_comments/list_reviews — including them here
        // too would duplicate timeline entries rather than add information.
        assert!(!RELEVANT_TIMELINE_EVENTS.contains(&"commented"));
        assert!(!RELEVANT_TIMELINE_EVENTS.contains(&"reviewed"));
        assert!(!RELEVANT_TIMELINE_EVENTS.contains(&"committed"));
        assert!(RELEVANT_TIMELINE_EVENTS.contains(&"labeled"));
        assert!(RELEVANT_TIMELINE_EVENTS.contains(&"merged"));
        assert!(RELEVANT_TIMELINE_EVENTS.contains(&"connected"));
    }
}
