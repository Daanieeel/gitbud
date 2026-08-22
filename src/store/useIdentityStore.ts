import { create } from "zustand";
import { api } from "@/lib/tauri";
import { useGitHubStore } from "./useGitHubStore";
import { useSettingsStore } from "./useSettingsStore";
import { useRepoStore } from "./useRepoStore";
import type { SshIdentity } from "@/lib/types";

// Unified account switcher entries: a GitHub login (used for PR/API features) or a plain
// SSH-key-based identity (host + key, no hosted-provider API) used to authenticate git
// operations. `id` is what's persisted as the per-repo override / global default.
export type UnifiedIdentity =
  | { id: string; kind: "github"; login: string; avatarUrl: string }
  | { id: string; kind: "ssh"; label: string; host: string; keyPath: string };

export function githubIdentityId(login: string): string {
  return `github:${login}`;
}

export function sshIdentityId(id: string): string {
  return `ssh:${id}`;
}

interface IdentityState {
  sshIdentities: SshIdentity[];
  init: () => Promise<void>;
  list: () => UnifiedIdentity[];
  addSshIdentity: (label: string, host: string, keyPath: string) => Promise<void>;
  removeSshIdentity: (id: string) => Promise<void>;
  /** Sets the active identity, either globally (default for repos with no override) or for
   * one specific repo. */
  setActive: (identityId: string, repoPath?: string) => Promise<void>;
  clearRepoOverride: (repoPath: string) => Promise<void>;
  /** Resolves the effective identity for a repo (its override, else the global default) and
   * wires it into that repo's git config. Call after selecting a repo or changing identities. */
  syncRepoIdentity: (repoPath: string) => Promise<void>;
}

export const useIdentityStore = create<IdentityState>((set, get) => ({
  sshIdentities: [],

  init: async () => {
    const sshIdentities = await api.listSshIdentities();
    set({ sshIdentities });
  },

  list: () => {
    const github: UnifiedIdentity[] = useGitHubStore
      .getState()
      .accounts.map((a) => ({ id: githubIdentityId(a.login), kind: "github", login: a.login, avatarUrl: a.avatar_url }));
    const ssh: UnifiedIdentity[] = get().sshIdentities.map((i) => ({
      id: sshIdentityId(i.id),
      kind: "ssh",
      label: i.label,
      host: i.host,
      keyPath: i.key_path,
    }));
    return [...github, ...ssh];
  },

  addSshIdentity: async (label, host, keyPath) => {
    const sshIdentities = await api.addSshIdentity(label, host, keyPath);
    set({ sshIdentities });
  },

  removeSshIdentity: async (id) => {
    const sshIdentities = await api.removeSshIdentity(id);
    set({ sshIdentities });
    const settings = useSettingsStore.getState();
    if (settings.settings.default_identity_id === sshIdentityId(id)) {
      await settings.update({ default_identity_id: null });
    }
  },

  setActive: async (identityId, repoPath) => {
    const identity = get()
      .list()
      .find((i) => i.id === identityId);
    if (identity?.kind === "github") {
      useGitHubStore.getState().setCurrentLogin(identity.login);
    }

    if (repoPath) {
      const repos = await api.setRepoIdentity(repoPath, identityId);
      useRepoStore.setState({ repos });
    } else {
      await useSettingsStore.getState().update({ default_identity_id: identityId });
    }
    const target = repoPath ?? useRepoStore.getState().selectedRepo;
    if (target) await get().syncRepoIdentity(target);
  },

  clearRepoOverride: async (repoPath) => {
    const repos = await api.setRepoIdentity(repoPath, null);
    useRepoStore.setState({ repos });
    await get().syncRepoIdentity(repoPath);
  },

  syncRepoIdentity: async (repoPath) => {
    const override = useRepoStore.getState().repos.find((r) => r.path === repoPath)?.identity_id ?? null;
    const identityId = override ?? useSettingsStore.getState().settings.default_identity_id;
    const identity = identityId ? get().list().find((i) => i.id === identityId) : undefined;
    if (identity?.kind === "ssh") {
      await api.applySshIdentityToRepo(repoPath, identity.keyPath);
    } else {
      await api.clearSshIdentityFromRepo(repoPath);
    }
  },
}));
