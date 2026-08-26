use crate::image_diff::mime_for;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::path::{Path, PathBuf};

/// Recognized icon filenames, best to worst. Monorepos rarely keep one at the repo root (see
/// e.g. `apps/web/public/favicon.ico`), so the scan below walks the tree instead of checking a
/// fixed list of paths — this list only ranks candidates once found, preferring a vector mark
/// over a raster one, and a plain favicon/logo over a single fixed-size derivative.
fn priority(filename: &str) -> Option<u8> {
    match filename.to_lowercase().as_str() {
        "favicon.svg" => Some(0),
        "favicon.ico" => Some(1),
        "logo.svg" => Some(2),
        "icon.svg" => Some(3),
        "logo.png" => Some(4),
        "icon.png" => Some(5),
        "apple-touch-icon.png" => Some(6),
        "favicon-32x32.png" => Some(7),
        "favicon-16x16.png" => Some(8),
        "favicon.png" => Some(9),
        _ => None,
    }
}

/// Directories not worth descending into: dependency/build output (large, and any icon-looking
/// file in there belongs to a dependency, not this repo) plus native mobile project dirs, whose
/// icon assets live under deeply nested, oddly-named folders (`mipmap-xxhdpi`, `AppIcon.appiconset`)
/// that don't match the plain-filename convention this scan looks for.
fn should_skip_dir(name: &str) -> bool {
    matches!(
        name.to_lowercase().as_str(),
        "node_modules"
            | ".git"
            | "target"
            | "dist"
            | "build"
            | "out"
            | ".next"
            | ".nuxt"
            | ".turbo"
            | ".output"
            | ".svelte-kit"
            | "coverage"
            | "vendor"
            | ".cache"
            | "__pycache__"
            | "venv"
            | ".venv"
            | "android"
            | "ios"
    )
}

/// How many directory levels below the repo root to descend, e.g. `apps/web/public/favicon.ico`
/// is at depth 3. Deep enough for a typical monorepo layout, shallow enough to stay fast.
const MAX_DEPTH: u32 = 5;

/// Hard cap on directories visited, as a backstop against pathological trees that slip past
/// `should_skip_dir` (e.g. a huge flat `packages/` with hundreds of entries).
const MAX_DIRS_VISITED: u32 = 4000;

/// Cap on the icon file size, so a generically-named "logo.png" that's actually a multi-megabyte
/// hero image doesn't bloat the sidebar with a slow-to-decode data URI.
const MAX_ICON_BYTES: u64 = 512 * 1024;

/// Reads one directory, returning the best-ranked icon file directly inside it (if any) and the
/// subdirectories worth descending into.
fn scan_dir(dir: &Path) -> (Option<(u8, PathBuf)>, Vec<PathBuf>) {
    let mut best: Option<(u8, PathBuf)> = None;
    let mut subdirs = Vec::new();

    let Ok(entries) = std::fs::read_dir(dir) else {
        return (None, subdirs);
    };
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let name = entry.file_name();
        let name = name.to_string_lossy();

        if file_type.is_dir() {
            if (!name.starts_with('.') || name == ".github") && !should_skip_dir(&name) {
                subdirs.push(entry.path());
            }
            continue;
        }

        let Some(rank) = priority(&name) else {
            continue;
        };
        if best
            .as_ref()
            .is_some_and(|(best_rank, _)| rank >= *best_rank)
        {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.len() == 0 || metadata.len() > MAX_ICON_BYTES {
            continue;
        }
        best = Some((rank, entry.path()));
    }

    (best, subdirs)
}

/// Best-effort icon for a repo, as a `data:<mime>;base64,...` URI, or `None` if no recognized
/// icon file was found anywhere in the working tree (within the depth/size limits below).
/// Purely cosmetic for the sidebar — callers should fall back to a letter avatar or provider
/// mark when this returns `None`.
///
/// Walks the tree breadth-first and stops at the shallowest depth that has any match — a repo
/// root icon is a much stronger signal than one nested three folders down in some sub-app, so a
/// root-level `favicon.ico` wins over a higher-ranked `favicon.svg` found deeper in the tree.
/// Ties within the same depth are broken by `priority`.
pub fn get_repo_icon(repo_path: &str) -> Option<String> {
    let mut current_level = vec![PathBuf::from(repo_path)];
    let mut dirs_visited: u32 = 0;

    for _ in 0..=MAX_DEPTH {
        if current_level.is_empty() {
            break;
        }

        let mut best: Option<(u8, PathBuf)> = None;
        let mut next_level = Vec::new();
        for dir in &current_level {
            if dirs_visited >= MAX_DIRS_VISITED {
                break;
            }
            dirs_visited += 1;

            let (dir_best, subdirs) = scan_dir(dir);
            if let Some((rank, path)) = dir_best {
                if best.as_ref().is_none_or(|(best_rank, _)| rank < *best_rank) {
                    best = Some((rank, path));
                }
            }
            next_level.extend(subdirs);
        }

        if let Some((_, path)) = best {
            let bytes = std::fs::read(&path).ok()?;
            let filename = path.file_name()?.to_str()?;
            return Some(format!(
                "data:{};base64,{}",
                mime_for(filename),
                STANDARD.encode(bytes)
            ));
        }
        current_level = next_level;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gitbud-repo-icon-test-{name}-{:?}",
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn finds_favicon_at_root() {
        let dir = temp_dir("root");
        std::fs::write(dir.join("favicon.ico"), b"fake-ico-bytes").unwrap();

        let icon = get_repo_icon(dir.to_str().unwrap());
        assert_eq!(
            icon,
            Some(format!(
                "data:image/x-icon;base64,{}",
                STANDARD.encode(b"fake-ico-bytes")
            ))
        );

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn finds_favicon_nested_in_monorepo_app() {
        let dir = temp_dir("nested");
        let nested = dir.join("apps").join("web").join("public");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("favicon.ico"), b"nested-ico").unwrap();

        let icon = get_repo_icon(dir.to_str().unwrap());
        assert_eq!(
            icon,
            Some(format!(
                "data:image/x-icon;base64,{}",
                STANDARD.encode(b"nested-ico")
            ))
        );

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn prefers_favicon_svg_over_ico() {
        let dir = temp_dir("svg-priority");
        std::fs::write(dir.join("favicon.ico"), b"ico").unwrap();
        std::fs::write(dir.join("favicon.svg"), b"<svg/>").unwrap();

        let icon = get_repo_icon(dir.to_str().unwrap()).unwrap();
        assert!(icon.starts_with("data:image/svg+xml;base64,"));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn prefers_shallower_match_over_deeper_higher_priority_one() {
        let dir = temp_dir("shallow-vs-deep");
        std::fs::write(dir.join("favicon.ico"), b"root-ico").unwrap();
        let nested = dir.join("apps").join("web").join("public");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("favicon.svg"), b"<svg/>").unwrap();

        let icon = get_repo_icon(dir.to_str().unwrap()).unwrap();
        assert_eq!(
            icon,
            format!("data:image/x-icon;base64,{}", STANDARD.encode(b"root-ico"))
        );

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn skips_node_modules() {
        let dir = temp_dir("skip-nm");
        let nm = dir.join("node_modules").join("some-pkg");
        std::fs::create_dir_all(&nm).unwrap();
        std::fs::write(nm.join("favicon.ico"), b"dep-ico").unwrap();

        assert_eq!(get_repo_icon(dir.to_str().unwrap()), None);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn returns_none_when_no_candidate_exists() {
        let dir = temp_dir("none");
        assert_eq!(get_repo_icon(dir.to_str().unwrap()), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn skips_oversized_file() {
        let dir = temp_dir("big");
        std::fs::write(
            dir.join("favicon.ico"),
            vec![0u8; (MAX_ICON_BYTES + 1) as usize],
        )
        .unwrap();
        assert_eq!(get_repo_icon(dir.to_str().unwrap()), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
