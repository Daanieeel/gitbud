import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type UpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "installing"
  | "unconfigured"
  | "error";

interface UpdateState {
  status: UpdateStatus;
  update: Update | null;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  install: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: "idle",
  update: null,
  error: null,

  checkForUpdates: async () => {
    if (get().status === "checking" || get().status === "installing") return;
    set({ status: "checking", error: null });
    try {
      const result = await check();
      set(
        result ? { status: "available", update: result } : { status: "up-to-date", update: null },
      );
    } catch (e) {
      const message = String(e);
      // The updater plugin has no endpoint/signing key configured for this build yet.
      set(
        /endpoint|url/i.test(message)
          ? { status: "unconfigured" }
          : { status: "error", error: message },
      );
    }
  },

  install: async () => {
    const { update } = get();
    if (!update) return;
    set({ status: "installing", error: null });
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },
}));
