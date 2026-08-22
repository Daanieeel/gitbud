import { create } from "zustand";
import { api } from "@/lib/tauri";
import type { Workspace } from "@/lib/types";

interface WorkspaceState {
  workspaces: Workspace[];
  activeId: string | null;
  init: () => Promise<void>;
  setActive: (id: string | null) => void;
  create: (name: string, repoPaths: string[]) => Promise<void>;
  update: (id: string, name: string, repoPaths: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeId: null,

  init: async () => {
    const workspaces = await api.listWorkspaces();
    set({ workspaces });
  },

  setActive: (id) => set({ activeId: id }),

  create: async (name, repoPaths) => {
    const workspaces = await api.createWorkspace(name, repoPaths);
    set({ workspaces });
  },

  update: async (id, name, repoPaths) => {
    const workspaces = await api.updateWorkspace(id, name, repoPaths);
    set({ workspaces });
  },

  remove: async (id) => {
    const workspaces = await api.deleteWorkspace(id);
    set({ workspaces });
    if (get().activeId === id) set({ activeId: null });
  },
}));
