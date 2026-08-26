use git2::Repository;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmoduleInfo {
    pub name: String,
    pub path: String,
    pub url: Option<String>,
    pub head_oid: Option<String>,
    pub initialized: bool,
}

pub fn list_submodules(repo_path: &str) -> Result<Vec<SubmoduleInfo>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.message().to_string())?;
    let submodules = repo.submodules().map_err(|e| e.message().to_string())?;

    Ok(submodules
        .iter()
        .map(|sub| SubmoduleInfo {
            name: sub.name().unwrap_or("").to_string(),
            path: sub.path().to_string_lossy().to_string(),
            url: sub.url().map(|s| s.to_string()),
            head_oid: sub.workdir_id().map(|id| id.to_string()),
            initialized: sub.workdir_id().is_some(),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_no_submodules_for_a_repo_without_any() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let repo_root = std::path::Path::new(manifest_dir)
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .to_string_lossy()
            .to_string();

        let submodules = list_submodules(&repo_root).expect("should succeed even with none");
        assert!(submodules.is_empty());
    }
}
