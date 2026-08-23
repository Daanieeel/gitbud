import { create } from "zustand";

export type PRFilter = "open" | "closed" | "all";

// Pure UI-selection state for the Pull Requests tab. The PR list, detail (files/comments), and
// mutations all live in TanStack Query now — see src/hooks/queries/usePullRequests.ts — this
// store only ever holds "what's picked" and the locally-remembered watch list.
interface PRState {
  filter: PRFilter;
  setFilter: (filter: PRFilter) => void;

  selectedNumber: number | null;
  selectedFilePath: string | null;
  selectPR: (number: number | null) => void;
  selectFile: (path: string | null) => void;

  // Which PR numbers get polled for CI-status desktop notifications — see useProviderSync.
  watched: number[];
  toggleWatch: (number: number) => void;
}

export const usePRStore = create<PRState>((set) => ({
  filter: "open",
  setFilter: (filter) => set({ filter }),

  selectedNumber: null,
  selectedFilePath: null,
  selectPR: (number) => set({ selectedNumber: number, selectedFilePath: null }),
  selectFile: (path) => set({ selectedFilePath: path }),

  watched: [],
  toggleWatch: (number) =>
    set((s) => ({
      watched: s.watched.includes(number) ? s.watched.filter((n) => n !== number) : [...s.watched, number],
    })),
}));
