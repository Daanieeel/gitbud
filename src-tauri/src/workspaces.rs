use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// A user-defined, named set of repos (independent of the auto-derived owner grouping or
/// sidebar sections) that can be filtered to and batch-synced together.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub repo_paths: Vec<String>,
}

fn config_dir() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or("could not resolve config directory")?;
    let dir = base.join("gitbud");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn workspaces_file() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("workspaces.json"))
}

pub fn list() -> Result<Vec<Workspace>, String> {
    let file = workspaces_file()?;
    if !file.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

fn save_all(workspaces: &[Workspace]) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(workspaces).map_err(|e| e.to_string())?;
    fs::write(workspaces_file()?, contents).map_err(|e| e.to_string())
}

pub fn create(name: &str, repo_paths: Vec<String>) -> Result<Vec<Workspace>, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Workspace name is required".to_string());
    }
    let mut workspaces = list()?;
    let id = format!("{name}-{}", chrono::Utc::now().timestamp_millis());
    workspaces.push(Workspace { id, name: name.to_string(), repo_paths });
    save_all(&workspaces)?;
    Ok(workspaces)
}

pub fn update(id: &str, name: &str, repo_paths: Vec<String>) -> Result<Vec<Workspace>, String> {
    let mut workspaces = list()?;
    let workspace = workspaces.iter_mut().find(|w| w.id == id).ok_or("Workspace not found")?;
    workspace.name = name.trim().to_string();
    workspace.repo_paths = repo_paths;
    save_all(&workspaces)?;
    Ok(workspaces)
}

pub fn remove(id: &str) -> Result<Vec<Workspace>, String> {
    let mut workspaces = list()?;
    workspaces.retain(|w| w.id != id);
    save_all(&workspaces)?;
    Ok(workspaces)
}
