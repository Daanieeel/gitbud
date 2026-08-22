use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LfsFileInfo {
    pub path: String,
    pub is_lfs: bool,
    pub oid: Option<String>,
    pub size: Option<u64>,
}

/// Whether this repo has any Git LFS filters configured at all (checked once per repo, not
/// per file — `.gitattributes` is the cheap, reliable signal).
pub fn has_lfs(repo_path: &str) -> bool {
    std::fs::read_to_string(Path::new(repo_path).join(".gitattributes"))
        .map(|contents| contents.contains("filter=lfs"))
        .unwrap_or(false)
}

/// Reads an LFS pointer file's oid/size without needing the real object to be present —
/// pointer files are tiny, so this works even for objects that haven't been pulled yet.
fn read_pointer(repo_path: &str, path: &str) -> (Option<String>, Option<u64>) {
    let Ok(contents) = std::fs::read_to_string(Path::new(repo_path).join(path)) else {
        return (None, None);
    };
    if !contents.starts_with("version https://git-lfs.github.com/spec") {
        return (None, None);
    }
    let mut oid = None;
    let mut size = None;
    for line in contents.lines() {
        if let Some(v) = line.strip_prefix("oid sha256:") {
            oid = Some(v.trim().to_string());
        }
        if let Some(v) = line.strip_prefix("size ") {
            size = v.trim().parse().ok();
        }
    }
    (oid, size)
}

/// Checks which of `paths` are LFS-tracked (via `git check-attr filter`, which respects
/// `.gitattributes` patterns exactly the way git itself does) and, for those, reads the
/// pointer file's declared object size.
pub fn check_lfs_files(repo_path: &str, paths: &[String]) -> Result<Vec<LfsFileInfo>, String> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    let output = Command::new(crate::settings::git_binary())
        .current_dir(repo_path)
        .arg("check-attr")
        .arg("filter")
        .arg("--")
        .args(paths)
        .output()
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&output.stdout);

    let mut lfs_paths: HashSet<String> = HashSet::new();
    for line in text.lines() {
        if let Some((path, value)) = line.rsplit_once(": filter: ") {
            if value.trim() == "lfs" {
                lfs_paths.insert(path.to_string());
            }
        }
    }

    Ok(paths
        .iter()
        .map(|path| {
            let is_lfs = lfs_paths.contains(path);
            let (oid, size) = if is_lfs { read_pointer(repo_path, path) } else { (None, None) };
            LfsFileInfo { path: path.clone(), is_lfs, oid, size }
        })
        .collect())
}
