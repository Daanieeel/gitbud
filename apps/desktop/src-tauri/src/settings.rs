use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PullStrategy {
    Merge,
    Rebase,
    FfOnly,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiffViewMode {
    Unified,
    Split,
}

/// The three line-diff algorithms libgit2 (which every diff in this app goes through) actually
/// implements — "histogram" isn't offered because libgit2 itself has no such algorithm; getting
/// it would mean shelling out to the real `git` CLI for diffing instead, which is a much bigger
/// change than a diff-algorithm setting.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiffAlgorithm {
    Myers,
    Minimal,
    Patience,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SidebarSort {
    Name,
    Recent,
    Group,
    Manual,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum OpenPrAfterCreation {
    InApp,
    Provider,
}

/// How long already-fetched, no-longer-viewed data stays in memory before being freed, trading
/// memory for snappier repo/tab switching. Only affects the frontend's in-memory query cache for
/// cheap-to-refetch local git data (status, branches, log, diffs, ...); it's unrelated to the
/// always-on local SQLite mirror for GitHub PR data (repo-scoped PR/CI data plus a separate,
/// indefinitely-kept avatar cache — see `pr_cache.rs`), or that data's own deliberate eviction on
/// leaving a PR/tab/repo, neither of which is configurable.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum CacheLevel {
    None,
    Minimal,
    #[default]
    Balanced,
    Relaxed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    // General
    pub theme: ThemeMode,
    pub default_clone_dir: Option<String>,

    // Git
    pub git_name: Option<String>,
    pub git_email: Option<String>,
    pub default_branch_name: String,
    pub pull_strategy: PullStrategy,

    // Diff
    pub diff_view: DiffViewMode,
    pub ignore_whitespace: bool,
    pub diff_font_size: u32,
    pub diff_algorithm: DiffAlgorithm,

    // Sidebar
    pub show_ahead_behind: bool,
    pub sidebar_sort: SidebarSort,

    // Changes
    pub auto_stage_new_changes: bool,
    /// Internal migration flag, not exposed in the UI. Missing/`false` (the case for settings
    /// files written before this field existed) means `auto_stage_new_changes` must be forced
    /// off once, since it used to default to `true`.
    #[serde(default)]
    pub auto_stage_migrated: bool,

    // Advanced
    pub git_binary_path: Option<String>,
    pub fs_watch_enabled: bool,

    // Identity
    /// Opaque id of the globally-active git identity (a GitHub account or SSH identity),
    /// interpreted by the frontend. `None` means "no identity chosen yet".
    pub default_identity_id: Option<String>,

    // Notifications
    pub desktop_notifications: bool,

    // Pull requests
    /// Renamed from the old `open_pr_on_provider_after_creation: bool` — the key changed, so any
    /// settings file written before this field existed simply has no value for it and falls back
    /// to `Settings::default()`'s `InApp`, which is the intended one-time retroactive default
    /// switch for existing users (they used to get the provider opened in-browser by default).
    pub open_pr_after_creation: OpenPrAfterCreation,

    // Editor
    /// Id of the chosen "Open in <editor>" target (see `system::EDITORS`), or `"custom"` for
    /// `custom_editor_command`. `None` means no favorite editor has been chosen yet.
    pub favorite_editor: Option<String>,
    /// Absolute path to the app bundle (macOS `.app`) or executable the user picked via a file
    /// dialog, used when `favorite_editor` is `"custom"`.
    pub custom_editor_command: Option<String>,

    // Performance
    #[serde(default)]
    pub cache_level: CacheLevel,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: ThemeMode::System,
            default_clone_dir: None,
            git_name: None,
            git_email: None,
            default_branch_name: "main".to_string(),
            pull_strategy: PullStrategy::Merge,
            diff_view: DiffViewMode::Unified,
            ignore_whitespace: false,
            diff_font_size: 12,
            diff_algorithm: DiffAlgorithm::Myers,
            show_ahead_behind: true,
            sidebar_sort: SidebarSort::Group,
            auto_stage_new_changes: false,
            auto_stage_migrated: true,
            git_binary_path: None,
            fs_watch_enabled: true,
            default_identity_id: None,
            desktop_notifications: true,
            favorite_editor: None,
            custom_editor_command: None,
            open_pr_after_creation: OpenPrAfterCreation::InApp,
            cache_level: CacheLevel::Balanced,
        }
    }
}

fn config_dir() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or("could not resolve config directory")?;
    let dir = base.join("gitbud");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn settings_file() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("settings.json"))
}

pub fn get_settings() -> Result<Settings, String> {
    let file = settings_file()?;
    if !file.exists() {
        return Ok(Settings::default());
    }
    let contents = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let mut settings: Settings = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    if !settings.auto_stage_migrated {
        settings.auto_stage_new_changes = false;
        settings.auto_stage_migrated = true;
        save_settings(&settings)?;
    }
    Ok(settings)
}

pub fn save_settings(settings: &Settings) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(settings_file()?, contents).map_err(|e| e.to_string())
}

/// Exports the current settings (identity, preferences, sidebar layout, etc) as pretty JSON
/// to an arbitrary file, so they can be carried over to another machine.
pub fn export_settings(dest_path: &str) -> Result<(), String> {
    let settings = get_settings()?;
    let contents = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(dest_path, contents).map_err(|e| e.to_string())
}

/// Imports settings previously written by `export_settings`, replacing the current settings.
pub fn import_settings(src_path: &str) -> Result<Settings, String> {
    let contents = fs::read_to_string(src_path).map_err(|e| e.to_string())?;
    let settings: Settings = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    save_settings(&settings)?;
    Ok(settings)
}

/// Effective git binary to shell out to — the configured override, or plain "git" to
/// resolve from PATH.
pub fn git_binary() -> String {
    get_settings()
        .ok()
        .and_then(|s| s.git_binary_path)
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| "git".to_string())
}

pub fn get_git_identity(repo_path: &str) -> Result<(Option<String>, Option<String>), String> {
    let repo = git2::Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let config = repo.config().map_err(|e| e.message().to_string())?;
    let name = config.get_string("user.name").ok();
    let email = config.get_string("user.email").ok();
    Ok((name, email))
}

pub fn set_git_identity(
    repo_path: &str,
    name: &str,
    email: &str,
    global: bool,
) -> Result<(), String> {
    if global {
        let mut config = git2::Config::open_default().map_err(|e| e.message().to_string())?;
        config
            .set_str("user.name", name)
            .map_err(|e| e.message().to_string())?;
        config
            .set_str("user.email", email)
            .map_err(|e| e.message().to_string())?;
    } else {
        let repo = git2::Repository::open(repo_path).map_err(|e| e.message().to_string())?;
        let mut config = repo.config().map_err(|e| e.message().to_string())?;
        config
            .set_str("user.name", name)
            .map_err(|e| e.message().to_string())?;
        config
            .set_str("user.email", email)
            .map_err(|e| e.message().to_string())?;
    }
    Ok(())
}
