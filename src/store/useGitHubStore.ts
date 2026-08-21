import { create } from "zustand";
import { api } from "@/lib/tauri";
import type { DeviceCodeResponse, GitHubAccount } from "@/lib/types";

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

  init: () => Promise<void>;
  setClientId: (clientId: string) => Promise<void>;
  removeAccount: (login: string) => Promise<void>;
  setCurrentLogin: (login: string | null) => void;

  startSignIn: () => Promise<void>;
  cancelSignIn: () => void;
}

export const useGitHubStore = create<GitHubState>((set, get) => ({
  accounts: [],
  currentLogin: null,
  clientId: null,
  deviceFlow: null,
  pollGeneration: 0,

  init: async () => {
    const [accounts, clientId] = await Promise.all([
      api.githubListAccounts(),
      api.githubGetClientId(),
    ]);
    set({
      accounts,
      clientId,
      currentLogin: get().currentLogin ?? accounts[0]?.login ?? null,
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
}));
