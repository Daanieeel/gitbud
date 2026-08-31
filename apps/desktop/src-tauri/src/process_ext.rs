use std::process::Command;

/// Suppresses the console window Windows otherwise flashes for every spawned child process
/// (git, gh, gpg, ssh-keygen, taskkill, ...) — `std::process::Command` doesn't set this itself,
/// and without it each fetch/pull/push/commit briefly pops a terminal window on Windows. No-op
/// on other platforms.
pub trait NoWindowExt {
    fn no_window(&mut self) -> &mut Self;
}

impl NoWindowExt for Command {
    #[cfg(target_os = "windows")]
    fn no_window(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        self.creation_flags(CREATE_NO_WINDOW)
    }

    #[cfg(not(target_os = "windows"))]
    fn no_window(&mut self) -> &mut Self {
        self
    }
}
