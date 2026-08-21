import { create } from "zustand";
import { api } from "@/lib/tauri";
import type { StashEntry } from "@/lib/types";

interface StashState {
  stashes: StashEntry[];
  load: (repoPath: string) => Promise<void>;
  save: (repoPath: string, message: string, includeUntracked: boolean) => Promise<void>;
  apply: (repoPath: string, index: number) => Promise<void>;
  pop: (repoPath: string, index: number) => Promise<void>;
  drop: (repoPath: string, index: number) => Promise<void>;
}

export const useStashStore = create<StashState>((set, get) => ({
  stashes: [],

  load: async (repoPath) => {
    const stashes = await api.listStashes(repoPath);
    set({ stashes });
  },

  save: async (repoPath, message, includeUntracked) => {
    await api.stashSave(repoPath, message, includeUntracked);
    await get().load(repoPath);
  },

  apply: async (repoPath, index) => {
    await api.stashApply(repoPath, index);
  },

  pop: async (repoPath, index) => {
    await api.stashPop(repoPath, index);
    await get().load(repoPath);
  },

  drop: async (repoPath, index) => {
    await api.stashDrop(repoPath, index);
    await get().load(repoPath);
  },
}));
