use base64::{engine::general_purpose::STANDARD, Engine};
use git2::{Repository, Tree};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageDiff {
    pub old: Option<String>,
    pub new: Option<String>,
}

pub fn is_image_path(path: &str) -> bool {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "svg"
    )
}

fn mime_for(path: &str) -> &'static str {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn data_uri(path: &str, bytes: &[u8]) -> String {
    format!("data:{};base64,{}", mime_for(path), STANDARD.encode(bytes))
}

fn blob_at_path(repo: &Repository, tree: &Tree, path: &str) -> Option<String> {
    let entry = tree.get_path(Path::new(path)).ok()?;
    let object = entry.to_object(repo).ok()?;
    let blob = object.as_blob()?;
    Some(data_uri(path, blob.content()))
}

/// Image diff for a single working-tree file: either the staged side (HEAD blob vs. index
/// blob) or the unstaged side (index blob vs. the file currently on disk).
pub fn get_image_diff(repo_path: &str, path: &str, staged: bool) -> Result<ImageDiff, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let index = repo.index().map_err(|e| e.message().to_string())?;

    let index_blob = index
        .get_path(Path::new(path), 0)
        .and_then(|entry| repo.find_blob(entry.id).ok())
        .map(|blob| data_uri(path, blob.content()));

    if staged {
        let head_blob = repo
            .head()
            .ok()
            .and_then(|h| h.peel_to_tree().ok())
            .and_then(|tree| blob_at_path(&repo, &tree, path));
        Ok(ImageDiff {
            old: head_blob,
            new: index_blob,
        })
    } else {
        let working_bytes = std::fs::read(std::path::Path::new(repo_path).join(path))
            .ok()
            .map(|bytes| data_uri(path, &bytes));
        Ok(ImageDiff {
            old: index_blob,
            new: working_bytes,
        })
    }
}

/// Image diff for a file within a commit, against its first parent (or nothing, for a root commit).
pub fn get_commit_image_diff(repo_path: &str, oid: &str, path: &str) -> Result<ImageDiff, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let commit = repo
        .find_commit(git2::Oid::from_str(oid).map_err(|e| e.message().to_string())?)
        .map_err(|e| e.message().to_string())?;
    let tree = commit.tree().map_err(|e| e.message().to_string())?;
    let new_blob = blob_at_path(&repo, &tree, path);

    let old_blob = commit
        .parent(0)
        .ok()
        .and_then(|p| p.tree().ok())
        .and_then(|parent_tree| blob_at_path(&repo, &parent_tree, path));

    Ok(ImageDiff {
        old: old_blob,
        new: new_blob,
    })
}
