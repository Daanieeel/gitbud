import { create } from "zustand";
import { api } from "@/lib/tauri";
import type { Settings } from "@/lib/types";

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  default_clone_dir: null,
  git_name: null,
  git_email: null,
  default_branch_name: "main",
  pull_strategy: "merge",
  diff_view: "unified",
  ignore_whitespace: false,
  diff_font_size: 12,
  show_ahead_behind: true,
  sidebar_sort: "group",
  auto_stage_new_changes: true,
  git_binary_path: null,
  fs_watch_enabled: true,
  default_identity_id: null,
  desktop_notifications: true,
};

function applyTheme(theme: Settings["theme"]) {
  const root = document.documentElement;
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  root.classList.toggle("dark", resolved === "dark");
}

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  exportTo: (destPath: string) => Promise<void>;
  importFrom: (srcPath: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const settings = await api.getSettings();
    applyTheme(settings.theme);
    set({ settings, loaded: true });
  },

  update: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    if (patch.theme) applyTheme(next.theme);
    await api.saveSettings(next);
  },

  exportTo: async (destPath) => {
    await api.exportSettings(destPath);
  },

  importFrom: async (srcPath) => {
    const settings = await api.importSettings(srcPath);
    applyTheme(settings.theme);
    set({ settings });
  },
}));
