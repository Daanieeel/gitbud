import { useEffect, useState } from "react";
import { RepoSidebar } from "@/components/repo/RepoSidebar";
import { Toolbar } from "@/components/layout/Toolbar";
import { TabBar } from "@/components/layout/TabBar";
import { ChangesTab } from "@/components/changes/ChangesTab";
import { HistoryTab } from "@/components/history/HistoryTab";
import { PRTab } from "@/components/pr/PRTab";
import { UpstreamBanner } from "@/components/pr/UpstreamBanner";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useIdentityStore } from "@/store/useIdentityStore";
import { useGitHubStore } from "@/store/useGitHubStore";
import { usePRStore } from "@/store/usePRStore";
import { useNetworkStore } from "@/store/useNetworkStore";

function App() {
  const initGlobalListeners = useRepoStore((s) => s.initGlobalListeners);
  const loadRepos = useRepoStore((s) => s.loadRepos);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const branch = useRepoStore((s) => s.branch);
  const activeTab = useRepoStore((s) => s.activeTab);
  const repos = useRepoStore((s) => s.repos);
  const loadSettings = useSettingsStore((s) => s.load);
  const initIdentities = useIdentityStore((s) => s.init);
  const syncRepoIdentity = useIdentityStore((s) => s.syncRepoIdentity);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const pollWatchedChecks = usePRStore((s) => s.pollWatchedChecks);
  const pull = useRepoStore((s) => s.pull);

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

  // Deliberate exception to "no polling": GitHub gives a pure desktop client no event/webhook
  // mechanism for check-run status, so watched-PR CI notifications have no event-driven option.
  useEffect(() => {
    if (!selectedRepo || !currentLogin) return;
    const interval = setInterval(() => {
      void pollWatchedChecks(selectedRepo, currentLogin);
    }, 60_000);
    return () => clearInterval(interval);
  }, [selectedRepo, currentLogin, pollWatchedChecks]);

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

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-screen w-screen gap-3 bg-background p-3 text-foreground">
      <RepoSidebar />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-md">
          <Toolbar />
          {selectedRepo && branch && <UpstreamBanner repoPath={selectedRepo} branch={branch} />}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-md">
          {selectedRepo ? (
            <>
              <TabBar />
              <div className="min-h-0 flex-1">
                {activeTab === "changes" && <ChangesTab />}
                {activeTab === "history" && <HistoryTab />}
                {activeTab === "pulls" && <PRTab />}
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
      <Toaster position="bottom-right" richColors closeButton />
      <CommandPalette
        open={palette.open}
        mode={palette.mode}
        onOpenChange={(open) => setPalette((p) => ({ ...p, open }))}
      />
    </div>
    </TooltipProvider>
  );
}

export default App;
