use std::process::Command;

/// (editor id, macOS app name, CLI launcher command) — the macOS app name is used via `open -a`
/// (works even if the editor never installed a CLI shim); the CLI command is the fallback for
/// Windows/Linux, where there's no equivalent of `open -a` and we instead rely on whatever
/// launcher script the editor's installer put on PATH (JetBrains Toolbox and VS Code both offer
/// to do this; not guaranteed to be there, hence the "did you install the CLI shim" hint below).
const EDITORS: &[(&str, &str, &str)] = &[
    ("vscode", "Visual Studio Code", "code"),
    ("webstorm", "WebStorm", "webstorm"),
    ("rustrover", "RustRover", "rustrover"),
    ("intellij", "IntelliJ IDEA", "idea"),
    ("clion", "CLion", "clion"),
    ("pycharm", "PyCharm", "pycharm"),
    ("phpstorm", "PhpStorm", "phpstorm"),
    ("rider", "Rider", "rider"),
    ("goland", "GoLand", "goland"),
    ("androidstudio", "Android Studio", "studio"),
    ("xcode", "Xcode", "xcode"),
    ("zed", "Zed", "zed"),
    ("sublime", "Sublime Text", "subl"),
    ("cursor", "Cursor", "cursor"),
];

/// Opens `path` in the user's chosen editor. `editor` is one of the ids in `EDITORS`, or
/// `"custom"`, in which case `custom_app_path` is the absolute path to an app bundle (macOS
/// `.app`) or executable (Windows `.exe`, Linux binary) the user picked via a file dialog.
pub fn open_in_editor(path: &str, editor: &str, custom_app_path: Option<&str>) -> Result<(), String> {
    if editor == "custom" {
        let app_path = custom_app_path.ok_or("No custom editor configured")?;
        #[cfg(target_os = "macos")]
        {
            Command::new("open").args(["-a", app_path, path]).spawn().map_err(|e| e.to_string())?;
        }
        #[cfg(not(target_os = "macos"))]
        {
            Command::new(app_path).arg(path).spawn().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    let (_, mac_app_name, cli_command) = EDITORS
        .iter()
        .find(|(id, _, _)| *id == editor)
        .ok_or_else(|| format!("Unknown editor: {editor}"))?;

    #[cfg(target_os = "macos")]
    {
        let _ = cli_command;
        Command::new("open").args(["-a", mac_app_name, path]).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        Command::new(cli_command).arg(path).spawn().map_err(|_| {
            format!(
                "Couldn't launch '{cli_command}' — make sure {mac_app_name}'s command-line launcher is installed and on PATH"
            )
        })?;
    }
    Ok(())
}

/// Opens the platform's default terminal app at `path`.
pub fn open_in_terminal(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Terminal", path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/c", "start", "cmd", "/k", "cd", "/d", path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("x-terminal-emulator")
            .arg("--working-directory")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
