import { useEffect, useState } from "react";
import { PlusIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRepoStore } from "@/store/useRepoStore";
import { isBrokenTokenError, useGitHubStore } from "@/store/useGitHubStore";
import { usePRStore, type PRFilter } from "@/store/usePRStore";
import { PRList } from "./PRList";
import { PRDetail } from "./PRDetail";
import { CreatePRDialog } from "./CreatePRDialog";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { api } from "@/lib/tauri";
import { openUrl } from "@tauri-apps/plugin-opener";

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
  const filter = usePRStore((s) => s.filter);
  const setFilter = usePRStore((s) => s.setFilter);
  const selectedNumber = usePRStore((s) => s.selectedNumber);
  const load = usePRStore((s) => s.load);
  const selectPR = usePRStore((s) => s.selectPR);
  const reauth = useGitHubStore((s) => s.reauth);
  const openSignIn = useGitHubStore((s) => s.openSignIn);

  const [hasRemote, setHasRemote] = useState<boolean | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const { width, onPointerDown } = useResizableWidth("panel-width:pr-list", 320, 240, 640);

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

  if (loadError && loadError.includes("404")) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-4 text-center text-destructive">
          <span className="flex items-center justify-center gap-1.5 font-medium">
            <TriangleAlertIcon className="size-4 shrink-0" />
            Repository Not Found
          </span>
          <p className="text-xs leading-relaxed">
            GitHub returned a 404 error. If this repository belongs to an organization, you may need to explicitly grant GitBud access to that organization in your GitHub settings.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 text-foreground"
            onClick={() => void openUrl("https://github.com/settings/connections/applications/Ov23li3VnSdamGm6SrSm")}
          >
            Grant Organization Access
          </Button>
        </div>
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
        <div className="flex shrink-0 items-center justify-between border-b border-border p-2">
          <div className="flex gap-1">
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
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-3.5" />
            New Pull Request
          </Button>
        </div>
        <div className="border-b border-border px-2 py-1 text-xs text-muted-foreground">
          {loading ? "Loading…" : `${pulls.length} ${filter}`}
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
      <ResizeHandle onPointerDown={onPointerDown} />
      {selected ? (
        <PRDetail repoPath={repoPath} login={currentLogin} pr={selected} />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-dot-grid text-sm text-muted-foreground">
          Select a pull request
        </div>
      )}
      <CreatePRDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
