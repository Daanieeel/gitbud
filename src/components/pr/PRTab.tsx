import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRepoStore } from "@/store/useRepoStore";
import { useGitHubStore } from "@/store/useGitHubStore";
import { usePRStore } from "@/store/usePRStore";
import { PRList } from "./PRList";
import { PRDetail } from "./PRDetail";
import { CreatePRDialog } from "./CreatePRDialog";
import { api } from "@/lib/tauri";

export function PRTab() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const pulls = usePRStore((s) => s.pulls);
  const loading = usePRStore((s) => s.loading);
  const loadError = usePRStore((s) => s.loadError);
  const selectedNumber = usePRStore((s) => s.selectedNumber);
  const load = usePRStore((s) => s.load);
  const selectPR = usePRStore((s) => s.selectPR);

  const [hasRemote, setHasRemote] = useState<boolean | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!repoPath) return;
    void api.githubRemoteOwnerRepo(repoPath).then((r) => setHasRemote(r != null));
  }, [repoPath]);

  useEffect(() => {
    if (repoPath && currentLogin && hasRemote) void load(repoPath, currentLogin);
  }, [repoPath, currentLogin, hasRemote, load]);

  if (!repoPath) return null;

  if (!currentLogin) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Sign in with GitHub (bottom of the sidebar) to see pull requests
      </div>
    );
  }

  if (hasRemote === false) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        This repository has no GitHub origin remote
      </div>
    );
  }

  const selected = pulls.find((p) => p.number === selectedNumber);

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex w-80 shrink-0 flex-col border-r border-border">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-2">
          <span className="text-xs font-medium text-muted-foreground">
            {loading ? "Loading…" : `${pulls.length} open`}
          </span>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New Pull Request
          </Button>
        </div>
        {loadError && <div className="p-2 text-xs text-destructive">{loadError}</div>}
        <div className="min-h-0 flex-1">
          <PRList
            repoPath={repoPath}
            login={currentLogin}
            pulls={pulls}
            selectedNumber={selectedNumber}
            onSelect={(n) => void selectPR(repoPath, currentLogin, n)}
          />
        </div>
      </div>
      {selected ? (
        <PRDetail repoPath={repoPath} login={currentLogin} pr={selected} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select a pull request
        </div>
      )}
      <CreatePRDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
