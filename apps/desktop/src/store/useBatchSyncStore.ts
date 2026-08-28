import { create } from "zustand";
import { api } from "@/lib/tauri";
import { queryClient } from "@/lib/queryClient";
import { invalidateRepoAfterSync } from "@/hooks/queries/useGitSync";

const CONCURRENCY = 4;

type RepoOutcome = "pending" | "running" | "done" | "error";

type BatchSyncKind = "fetch" | "pull";

interface BatchSyncState {
  running: boolean;
  kind: BatchSyncKind | null;
  outcomes: Record<string, RepoOutcome>;
  errors: Record<string, string>;

  runFetchAll: (repoPaths: string[]) => Promise<void>;
  runPullAll: (repoPaths: string[]) => Promise<void>;
  dismiss: () => void;
}

async function runPool(
  paths: string[],
  concurrency: number,
  task: (path: string) => Promise<void>,
) {
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
  repoPaths: string[],
  kind: BatchSyncKind,
  action: (repoPath: string) => Promise<void>,
) {
  return async () => {
    set({
      running: true,
      kind,
      outcomes: Object.fromEntries(repoPaths.map((p): [string, RepoOutcome] => [p, "pending"])),
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
  kind: null,
  outcomes: {},
  errors: {},

  runFetchAll: (repoPaths) =>
    run(set, get, repoPaths, "fetch", async (path) => {
      await api.gitFetch(path);
      invalidateRepoAfterSync(queryClient, path);
    })(),

  runPullAll: (repoPaths) =>
    run(set, get, repoPaths, "pull", async (path) => {
      await api.gitPull(path);
      invalidateRepoAfterSync(queryClient, path);
    })(),

  dismiss: () => set({ outcomes: {}, errors: {} }),
}));
