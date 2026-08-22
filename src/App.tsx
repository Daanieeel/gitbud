import { useEffect } from "react";
import { RepoSidebar } from "@/components/repo/RepoSidebar";
import { Toolbar } from "@/components/layout/Toolbar";
import { TabBar } from "@/components/layout/TabBar";
import { ChangesTab } from "@/components/changes/ChangesTab";
import { HistoryTab } from "@/components/history/HistoryTab";
import { PRTab } from "@/components/pr/PRTab";
import { UpstreamBanner } from "@/components/pr/UpstreamBanner";
import { SyncLogToast } from "@/components/sync/SyncLogToast";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsStore } from "@/store/useSettingsStore";

function App() {
  const initGlobalListeners = useRepoStore((s) => s.initGlobalListeners);
  const loadRepos = useRepoStore((s) => s.loadRepos);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const branch = useRepoStore((s) => s.branch);
  const activeTab = useRepoStore((s) => s.activeTab);
  const repos = useRepoStore((s) => s.repos);
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    void initGlobalListeners();
    void loadRepos();
    void loadSettings();
  }, [initGlobalListeners, loadRepos, loadSettings]);

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      <RepoSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        {selectedRepo ? (
          <>
            {branch && <UpstreamBanner repoPath={selectedRepo} branch={branch} />}
            <TabBar />
            <div className="min-h-0 flex-1">
              {activeTab === "changes" && <ChangesTab />}
              {activeTab === "history" && <HistoryTab />}
              {activeTab === "pulls" && <PRTab />}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {repos.length === 0
              ? 'No repositories yet — use the "+" button to add one'
              : "Select a repository"}
          </div>
        )}
      </div>
      <SyncLogToast />
    </div>
  );
}

export default App;
