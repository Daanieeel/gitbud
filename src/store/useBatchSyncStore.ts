import { create } from "zustand";
import { api } from "@/lib/tauri";
import { useRepoStore } from "./useRepoStore";

const CONCURRENCY = 4;

type RepoOutcome = "pending" | "running" | "done" | "error";

interface BatchSyncState {
  running: boolean;
  op: "pull" | null;
  outcomes: Record<string, RepoOutcome>;
  errors: Record<string, string>;

  runPullAll: (repoPaths: string[]) => Promise<void>;
  dismiss: () => void;
}

async function runPool(paths: string[], concurrency: number, task: (path: string) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, paths.length) }, async () => {
    while (cursor < paths.length) {
      const path = paths[cursor++];
      await task(path);
    }
  });
  await Promise.all(workers);
}

function run(
  set: (partial: Partial<BatchSyncState>) => void,
  get: () => BatchSyncState,
  op: "pull",
  repoPaths: string[],
  action: (repoPath: string) => Promise<void>,
) {
  return async () => {
    set({
      running: true,
      op,
      outcomes: Object.fromEntries(repoPaths.map((p) => [p, "pending" as RepoOutcome])),
      errors: {},
    });
    await runPool(repoPaths, CONCURRENCY, async (path) => {
      set({ outcomes: { ...get().outcomes, [path]: "running" } });
      try {
        await action(path);
        set({ outcomes: { ...get().outcomes, [path]: "done" } });
      } catch (e) {
        set({
          outcomes: { ...get().outcomes, [path]: "error" },
          errors: { ...get().errors, [path]: String(e) },
        });
      }
    });
    set({ running: false });
  };
}

export const useBatchSyncStore = create<BatchSyncState>((set, get) => ({
  running: false,
  op: null,
  outcomes: {},
  errors: {},

  runPullAll: (repoPaths) =>
    run(set, get, "pull", repoPaths, async (path) => {
      await api.gitPull(path);
      await useRepoStore.getState().loadRepos();
    })(),

  dismiss: () => set({ outcomes: {}, errors: {}, op: null }),
}));
