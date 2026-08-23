import { useEffect, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRepoStore } from "@/store/useRepoStore";
import { isBrokenTokenError, useGitHubStore } from "@/store/useGitHubStore";
import { usePRStore, type PRFilter } from "@/store/usePRStore";
import { PRList } from "./PRList";
import { PRDetail } from "./PRDetail";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { api } from "@/lib/tauri";

const FILTERS: { key: PRFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export function PRTab() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const pulls = usePRStore((s) => s.pulls);
  const loading = usePRStore((s) => s.loading);
  const loadError = usePRStore((s) => s.loadError);
  const hasMore = usePRStore((s) => s.hasMore);
  const loadingMore = usePRStore((s) => s.loadingMore);
  const filter = usePRStore((s) => s.filter);
  const setFilter = usePRStore((s) => s.setFilter);
  const selectedNumber = usePRStore((s) => s.selectedNumber);
  const load = usePRStore((s) => s.load);
  const selectPR = usePRStore((s) => s.selectPR);
  const reauth = useGitHubStore((s) => s.reauth);
  const openSignIn = useGitHubStore((s) => s.openSignIn);

  const [hasRemote, setHasRemote] = useState<boolean | null>(null);
  const [reauthing, setReauthing] = useState(false);
  const { width, onPointerDown } = useResizableWidth("panel-width:pr-list", 260, 240, 640);

  useEffect(() => {
    if (!repoPath) return;
    void api.githubRemoteOwnerRepo(repoPath).then((r) => setHasRemote(r != null));
  }, [repoPath]);

  useEffect(() => {
    if (repoPath && currentLogin && hasRemote) void load(repoPath, currentLogin);
  }, [repoPath, currentLogin, hasRemote, filter, load]);

  if (!repoPath) return null;

  if (!currentLogin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-dot-grid text-center text-sm text-muted-foreground">
        <TriangleAlertIcon className="size-8 text-destructive" />
        <p className="max-w-sm">Sign in with GitHub to see pull requests</p>
        <Button variant="secondary" onClick={openSignIn}>
          Sign in with GitHub
        </Button>
      </div>
    );
  }

  if (loadError && isBrokenTokenError(loadError)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-dot-grid text-center text-sm text-muted-foreground">
        <TriangleAlertIcon className="size-8 text-destructive" />
        <p className="max-w-sm">{loadError}</p>
        <Button
          variant="secondary"
          disabled={reauthing}
          onClick={() => {
            setReauthing(true);
            void reauth(currentLogin).finally(() => setReauthing(false));
          }}
        >
          {reauthing ? "Reconnecting…" : "Reconnect GitHub"}
        </Button>
      </div>
    );
  }



  if (hasRemote === false) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        This repository has no GitHub origin remote
      </div>
    );
  }

  const selected = pulls.find((p) => p.number === selectedNumber);

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div style={{ width }} className="flex shrink-0 flex-col border-r border-border">
        <div className="flex shrink-0 items-center gap-1 border-b border-border p-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-2 py-1 text-xs hover:bg-accent",
                filter === f.key && "bg-accent font-medium",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="border-b border-border px-2 py-1 text-xs text-muted-foreground">
          {loading && pulls.length === 0 ? "Loading…" : `${pulls.length} ${filter}`}
        </div>
        {loadError && <div className="p-2 text-xs text-destructive">{loadError}</div>}
        <div className="min-h-0 flex-1">
          <PRList
            loading={loading}
            repoPath={repoPath}
            login={currentLogin}
            pulls={pulls}
            selectedNumber={selectedNumber}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={() => void usePRStore.getState().loadMore(repoPath, currentLogin)}
            onSelect={(n) => void selectPR(repoPath, currentLogin, n)}
          />
        </div>
      </div>
      <ResizeHandle onPointerDown={onPointerDown} />
      {selected ? (
        <PRDetail repoPath={repoPath} login={currentLogin} pr={selected} />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-dot-grid text-sm text-muted-foreground">
          Select a pull request
        </div>
      )}
    </div>
  );
}
