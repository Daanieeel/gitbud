use git2::Repository;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagInfo {
    pub name: String,
    pub oid: String,
    pub message: Option<String>,
}

pub fn list_tags(repo_path: &str) -> Result<Vec<TagInfo>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let names = repo.tag_names(None).map_err(|e| e.message().to_string())?;

    let mut tags = Vec::new();
    for name in names.iter().flatten() {
        let reference = repo
            .find_reference(&format!("refs/tags/{name}"))
            .map_err(|e| e.message().to_string())?;
        let target = reference.target().ok_or("tag reference has no direct target")?;

        // Lightweight tags point straight at a commit; annotated tags point at a tag
        // object that itself points at the commit. Try the annotated case first.
        let (oid, message) = match repo.find_tag(target) {
            Ok(annotated) => (
                annotated.target_id().to_string(),
                annotated.message().map(|m| m.to_string()),
            ),
            Err(_) => (target.to_string(), None),
        };

        tags.push(TagInfo { name: name.to_string(), oid, message });
    }
    Ok(tags)
}

/// Creates a tag on HEAD — annotated if `message` is non-empty, lightweight otherwise.
pub fn create_tag(repo_path: &str, name: &str, message: &str) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let head_commit = repo
        .head()
        .and_then(|h| h.peel_to_commit())
        .map_err(|e| e.message().to_string())?;

    if message.trim().is_empty() {
        repo.tag_lightweight(name, head_commit.as_object(), false)
            .map_err(|e| e.message().to_string())?;
    } else {
        let signature = repo.signature().map_err(|e| e.message().to_string())?;
        repo.tag(name, head_commit.as_object(), &signature, message, false)
            .map_err(|e| e.message().to_string())?;
    }
    Ok(())
}

pub fn delete_tag(repo_path: &str, name: &str) -> Result<(), String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    repo.tag_delete(name).map_err(|e| e.message().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo;

    struct ScratchRepo {
        path: std::path::PathBuf,
    }

    impl ScratchRepo {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "gitbud-test-tags-{name}-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(&path).unwrap();
            let repo = Repository::init(&path).unwrap();
            let mut config = repo.config().unwrap();
            config.set_str("user.name", "Test").unwrap();
            config.set_str("user.email", "test@example.com").unwrap();
            Self { path }
        }

        fn path_str(&self) -> String {
            self.path.to_string_lossy().to_string()
        }
    }

    impl Drop for ScratchRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn create_list_delete_tag_roundtrip() {
        let scratch = ScratchRepo::new("roundtrip");
        let repo_path = scratch.path_str();
        std::fs::write(scratch.path.join("a.txt"), "a\n").unwrap();
        repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        repo::commit(&repo_path, "base", "").unwrap();

        create_tag(&repo_path, "v1.0.0", "First release").unwrap();
        let tags = list_tags(&repo_path).unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "v1.0.0");
        assert_eq!(tags[0].message.as_deref(), Some("First release"));

        delete_tag(&repo_path, "v1.0.0").unwrap();
        assert!(list_tags(&repo_path).unwrap().is_empty());
    }

    #[test]
    fn lightweight_tag_has_no_message() {
        let scratch = ScratchRepo::new("lightweight");
        let repo_path = scratch.path_str();
        std::fs::write(scratch.path.join("a.txt"), "a\n").unwrap();
        repo::stage_paths(&repo_path, &["a.txt".to_string()]).unwrap();
        repo::commit(&repo_path, "base", "").unwrap();

        create_tag(&repo_path, "v0.1.0", "").unwrap();
        let tags = list_tags(&repo_path).unwrap();
        assert_eq!(tags[0].message, None);
    }
}
