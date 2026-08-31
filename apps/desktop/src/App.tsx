import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { RepoSidebar } from "@/components/repo/RepoSidebar";
import { Toolbar } from "@/components/layout/Toolbar";
import { TabBar } from "@/components/layout/TabBar";
import { ChangesTab } from "@/components/changes/ChangesTab";
import { HistoryTab } from "@/components/history/HistoryTab";
import { PRTab } from "@/components/pr/PRTab";
import { IssueTab } from "@/components/issue/IssueTab";
import { UpstreamBanner } from "@/components/pr/UpstreamBanner";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { ResolveDivergedPullDialog } from "@/components/repo/ResolveDivergedPullDialog";
import { ResolveUnstagedPullDialog } from "@/components/repo/ResolveUnstagedPullDialog";
import { Toaster } from "@gitbud/ui/sonner";
import { TooltipProvider } from "@gitbud/ui/tooltip";
import { AvatarCacheProvider } from "@gitbud/ui/avatar-cache";
import { DiffSettingsProvider } from "@gitbud/ui/diff-settings";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useIdentityStore } from "@/store/useIdentityStore";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useUpdateStore } from "@/store/useUpdateStore";
import { useBranches } from "@/hooks/queries/useBranches";
import { useGitSync } from "@/hooks/queries/useGitSync";
import { useProviderSync } from "@/hooks/useProviderSync";
import { applyCacheLevel } from "@/lib/queryClient";
import { api } from "@/lib/tauri";

function App() {
  const initGlobalListeners = useRepoStore((s) => s.initGlobalListeners);
  const loadRepos = useRepoStore((s) => s.loadRepos);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const { data: branchData } = useBranches(selectedRepo);
  const branch = branchData?.branch ?? null;
  const activeTab = useRepoStore((s) => s.activeTab);
  const repos = useRepoStore((s) => s.repos);
  const loadSettings = useSettingsStore((s) => s.load);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const cacheLevel = useSettingsStore((s) => s.settings.cache_level);
  const theme = useSettingsStore((s) => s.settings.theme);
  const diffFontSize = useSettingsStore((s) => s.settings.diff_font_size);
  const diffViewMode = useSettingsStore((s) => s.settings.diff_view);
  const updateSettings = useSettingsStore((s) => s.update);
  const initIdentities = useIdentityStore((s) => s.init);
  const syncRepoIdentity = useIdentityStore((s) => s.syncRepoIdentity);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  useProviderSync(selectedRepo, currentLogin);
  const { pull, fetch, push } = useGitSync(selectedRepo, branch);
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);

  const [palette, setPalette] = useState<{ open: boolean; mode: "all" | "repos" }>({
    open: false,
    mode: "all",
  });

  useEffect(() => {
    void initGlobalListeners();
    void loadRepos();
    void loadSettings();
    void initIdentities();
  }, [initGlobalListeners, loadRepos, loadSettings, initIdentities]);

  useEffect(() => {
    if (selectedRepo) void syncRepoIdentity(selectedRepo);
  }, [selectedRepo, syncRepoIdentity]);

  // Settings load asynchronously after the queryClient is already constructed with its own
  // hardcoded default, so this is what actually applies the persisted cache level. Deliberately
  // only on the initial load (not reactive to every `cacheLevel` change): the Settings dialog
  // requires a restart to change it, so this only ever needs to run once per app launch, right
  // after `settingsLoaded` flips true.
  useEffect(() => {
    if (settingsLoaded) applyCacheLevel(cacheLevel);
  }, [settingsLoaded]);

  // Deliberate exception to "no polling": there's no push channel for release publication, so
  // catching a new version requires asking the update endpoint periodically.
  useEffect(() => {
    void checkForUpdates();
    const interval = setInterval(() => void checkForUpdates(), 6 * 60 * 60_000);
    return () => clearInterval(interval);
  }, [checkForUpdates]);

  useEffect(() => {
    const goOnline = () => useNetworkStore.getState().setOffline(false);
    const goOffline = () => useNetworkStore.getState().setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === "p" && e.shiftKey) {
        e.preventDefault();
        void pull();
      } else if (key === "p") {
        e.preventDefault();
        setPalette({ open: true, mode: "all" });
      } else if (key === "k") {
        e.preventDefault();
        setPalette({ open: true, mode: "repos" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pull]);

  useEffect(() => {
    const unlisten = listen<string>("menu-event", (event) => {
      switch (event.payload) {
        case "settings":
          window.dispatchEvent(new CustomEvent("open-settings"));
          break;
        case "add_repo":
          setPalette({ open: true, mode: "repos" });
          break;
        case "fetch":
          void fetch();
          break;
        case "pull":
          void pull();
          break;
        case "push":
          void push();
          break;
        case "branch_switcher":
          window.dispatchEvent(new CustomEvent("open-branch-switcher"));
          break;
        case "create_pr":
          window.dispatchEvent(new CustomEvent("open-create-pr"));
          break;
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [fetch, pull, push]);

  return (
    <TooltipProvider delayDuration={300}>
      <AvatarCacheProvider
        value={{
          cacheAvatar: (src) => void api.cacheAvatar(src),
          getCachedAvatar: (src) => api.getCachedAvatar(src),
        }}
      >
        <DiffSettingsProvider
          value={{
            fontSize: diffFontSize,
            diffViewMode,
            setDiffViewMode: (mode) => void updateSettings({ diff_view: mode }),
          }}
        >
          <div className="flex h-screen w-screen gap-3 bg-background p-3 text-foreground">
            <RepoSidebar />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-md">
                <Toolbar />
                {selectedRepo && branch && (
                  <UpstreamBanner repoPath={selectedRepo} branch={branch} />
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-md">
                {selectedRepo ? (
                  <>
                    <TabBar />
                    <div className="min-h-0 flex-1">
                      {activeTab === "changes" && <ChangesTab />}
                      {activeTab === "history" && <HistoryTab />}
                      {activeTab === "pulls" && <PRTab />}
                      {activeTab === "issues" && <IssueTab />}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center bg-dot-grid text-sm text-muted-foreground">
                    {repos.length === 0
                      ? 'No repositories yet. Use the "+" button to add one'
                      : "Select a repository"}
                  </div>
                )}
              </div>
            </div>
            <Toaster theme={theme} position="bottom-right" richColors closeButton />
            <CommandPalette
              open={palette.open}
              mode={palette.mode}
              onOpenChange={(open) => setPalette((p) => ({ ...p, open }))}
            />
            <ResolveDivergedPullDialog />
            <ResolveUnstagedPullDialog />
          </div>
        </DiffSettingsProvider>
      </AvatarCacheProvider>
    </TooltipProvider>
  );
}

export default App;
