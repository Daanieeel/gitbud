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
  | {
      id: string;
      kind: "github";
      login: string;
      name: string | null;
      email: string;
      avatarUrl: string;
    }
  | {
      id: string;
      kind: "ssh";
      label: string;
      host: string;
      keyPath: string;
      name: string;
      email: string;
    };

export function githubIdentityId(login: string): string {
  return `github:${login}`;
}

export function sshIdentityId(id: string): string {
  return `ssh:${id}`;
}

/** The commit-attributable email for a GitHub identity — its stored email, falling back to
 * the noreply address for accounts saved before that field existed. */
function githubEmail(identity: { login: string; email: string }): string {
  return identity.email.trim() || `${identity.login}@users.noreply.github.com`;
}

interface IdentityState {
  sshIdentities: SshIdentity[];
  init: () => Promise<void>;
  list: () => UnifiedIdentity[];
  addSshIdentity: (
    label: string,
    host: string,
    keyPath: string,
    name: string,
    email: string,
  ) => Promise<void>;
  updateSshIdentity: (
    id: string,
    label: string,
    host: string,
    keyPath: string,
    name: string,
    email: string,
  ) => Promise<void>;
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
    const github: UnifiedIdentity[] = useGitHubStore.getState().accounts.map((a) => ({
      id: githubIdentityId(a.login),
      kind: "github",
      login: a.login,
      name: a.name,
      email: a.email,
      avatarUrl: a.avatar_url,
    }));
    const ssh: UnifiedIdentity[] = get().sshIdentities.map((i) => ({
      id: sshIdentityId(i.id),
      kind: "ssh",
      label: i.label,
      host: i.host,
      keyPath: i.key_path,
      name: i.name,
      email: i.email,
    }));
    return [...github, ...ssh];
  },

  addSshIdentity: async (label, host, keyPath, name, email) => {
    const sshIdentities = await api.addSshIdentity(label, host, keyPath, name, email);
    set({ sshIdentities });
  },

  updateSshIdentity: async (id, label, host, keyPath, name, email) => {
    const sshIdentities = await api.updateSshIdentity(id, label, host, keyPath, name, email);
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
    const override =
      useRepoStore.getState().repos.find((r) => r.path === repoPath)?.identity_id ?? null;
    let identityId = override ?? useSettingsStore.getState().settings.default_identity_id;
    if (!identityId) {
      const currentLogin = useGitHubStore.getState().currentLogin;
      if (currentLogin) {
        identityId = githubIdentityId(currentLogin);
      }
    }
    const identity = identityId
      ? get()
          .list()
          .find((i) => i.id === identityId)
      : undefined;
    if (identity?.kind === "ssh") {
      await api.applySshIdentityToRepo(repoPath, identity.keyPath);
    } else {
      await api.clearSshIdentityFromRepo(repoPath);
    }
    if (identity?.kind === "github") {
      // No per-repo override here means this identity is the global default, so it should
      // become the global git profile rather than just this one repo's local config.
      await api.setGitIdentity(
        repoPath,
        identity.name ?? identity.login,
        githubEmail(identity),
        override === null,
      );
    } else if (identity?.kind === "ssh" && identity.name.trim() && identity.email.trim()) {
      // Identities saved before name/email existed have both blank — leave `user.name`/
      // `user.email` as whatever they already were rather than overwriting with blanks.
      await api.setGitIdentity(repoPath, identity.name, identity.email, override === null);
    }
  },
}));
