import { create } from "zustand";

// Pure UI state: which workspace the sidebar is currently filtered to. The workspace data
// itself lives in TanStack Query (see useWorkspaces) — this just remembers the selection.
interface WorkspaceFilterState {
  activeId: string | null;
  setActive: (id: string | null) => void;
}

export const useWorkspaceFilterStore = create<WorkspaceFilterState>((set) => ({
  activeId: null,
  setActive: (id) => set({ activeId: id }),
}));
