import { create } from "zustand";
import { api } from "@/lib/tauri";
import type { DeviceCodeResponse, GitHubAccount } from "@/lib/types";

/** Matches the message `get_token` (src-tauri/src/github/auth.rs) returns when an account's
 * OS keychain entry is missing, so any call site can recognize it and offer re-auth instead
 * of just surfacing the raw error. */
export function isBrokenTokenError(error: string): boolean {
  return error.includes("missing from the system keychain");
}

type DeviceFlowStatus = "waiting" | "denied" | "expired" | "error";

interface DeviceFlowState {
  code: DeviceCodeResponse;
  status: DeviceFlowStatus;
  error?: string;
}

interface GitHubState {
  accounts: GitHubAccount[];
  currentLogin: string | null;
  clientId: string | null;
  deviceFlow: DeviceFlowState | null;
  pollGeneration: number;

  // Set when a GitHub API call fails because the account's OS keychain token is gone (see
  // `useGitHubStore.init`'s doc comment) — surfaced as a banner/link prompting re-auth,
  // rather than a raw error string wherever the failing call happened to be.
  brokenLogin: string | null;
  setBrokenLogin: (login: string | null) => void;
  /** Drops the broken account and starts the device-flow sign-in so the user can reconnect it in one click. */
  reauth: (login: string) => Promise<void>;

  init: () => Promise<void>;
  setClientId: (clientId: string) => Promise<void>;
  removeAccount: (login: string) => Promise<void>;
  setCurrentLogin: (login: string | null) => void;

  startSignIn: () => Promise<void>;
  cancelSignIn: () => void;
  tryGhCli: () => Promise<boolean>;

  signInOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;
}

export const useGitHubStore = create<GitHubState>((set, get) => ({
  accounts: [],
  currentLogin: null,
  clientId: null,
  deviceFlow: null,
  pollGeneration: 0,
  brokenLogin: null,
  signInOpen: false,

  setBrokenLogin: (login) => set({ brokenLogin: login }),
  openSignIn: () => set({ signInOpen: true }),
  closeSignIn: () => set({ signInOpen: false }),

  reauth: async (login) => {
    await get().removeAccount(login);
    set({ brokenLogin: null, signInOpen: true });
  },

  init: async () => {
    const [storedAccounts, clientId] = await Promise.all([
      api.githubListAccounts(),
      api.githubGetClientId(),
    ]);
    const accounts = storedAccounts; // Temporary: stop aggressive pruning

    set({
      accounts,
      clientId,
      currentLogin: accounts.some((a) => a.login === get().currentLogin)
        ? get().currentLogin
        : accounts[0]?.login ?? null,
    });
  },

  setClientId: async (clientId) => {
    await api.githubSetClientId(clientId);
    set({ clientId });
  },

  removeAccount: async (login) => {
    const accounts = await api.githubRemoveAccount(login);
    set({ accounts });
    if (get().currentLogin === login) {
      set({ currentLogin: accounts[0]?.login ?? null });
    }
  },

  setCurrentLogin: (login) => set({ currentLogin: login }),

  startSignIn: async () => {
    const clientId = get().clientId;
    if (!clientId) return;
    const generation = get().pollGeneration + 1;
    set({ pollGeneration: generation });

    const code = await api.githubStartDeviceFlow(clientId);
    if (get().pollGeneration !== generation) return;
    set({ deviceFlow: { code, status: "waiting" } });

    const deadline = Date.now() + code.expires_in * 1000;
    const poll = async () => {
      if (get().pollGeneration !== generation) return;
      if (Date.now() > deadline) {
        set({ deviceFlow: { code, status: "expired" } });
        return;
      }
      try {
        const result = await api.githubPollDeviceFlow(clientId, code.device_code);
        if (get().pollGeneration !== generation) return;
        if (result.status === "success") {
          set((s) => ({
            accounts: [...s.accounts.filter((a) => a.login !== result.account.login), result.account],
            currentLogin: result.account.login,
            deviceFlow: null,
          }));
          return;
        }
        if (result.status === "denied") {
          set({ deviceFlow: { code, status: "denied" } });
          return;
        }
        if (result.status === "expired") {
          set({ deviceFlow: { code, status: "expired" } });
          return;
        }
        setTimeout(() => void poll(), code.interval * 1000);
      } catch (err) {
        set({ deviceFlow: { code, status: "error", error: String(err) } });
      }
    };
    setTimeout(() => void poll(), code.interval * 1000);
  },

  cancelSignIn: () => {
    set((s) => ({ pollGeneration: s.pollGeneration + 1, deviceFlow: null }));
  },

  tryGhCli: async () => {
    const account = await api.githubDetectGhCli().catch(() => null);
    if (!account) return false;
    set((s) => ({
      accounts: [...s.accounts.filter((a) => a.login !== account.login), account],
      currentLogin: account.login,
    }));
    return true;
  },
}));
