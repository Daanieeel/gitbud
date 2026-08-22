import { useEffect, useState } from "react";
import { BoxIcon, DownloadIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";
import type { SubmoduleInfo } from "@/lib/types";

export function SubmodulesPanel() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const [submodules, setSubmodules] = useState<SubmoduleInfo[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!repoPath) return;
    void api.listSubmodules(repoPath).then(setSubmodules);
  }, [repoPath]);

  if (!repoPath || submodules.length === 0) return null;

  const refresh = () => void api.listSubmodules(repoPath).then(setSubmodules);

  const updateOne = async (path: string) => {
    setBusy(true);
    try {
      await api.updateSubmodule(repoPath, path);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const updateAll = async () => {
    setBusy(true);
    try {
      await api.updateAllSubmodules(repoPath);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const uninitialized = submodules.filter((s) => !s.initialized).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title="Submodules">
          <BoxIcon className="size-3.5" />
          {submodules.length}
          {uninitialized > 0 && <span className="text-accent-yellow">!</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="max-h-56 overflow-auto p-1">
          {submodules.map((sub) => (
            <div key={sub.path} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate" title={sub.url ?? undefined}>
                {sub.path}
              </span>
              {sub.initialized ? (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {sub.head_oid?.slice(0, 7)}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-accent-yellow">not initialized</span>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void updateOne(sub.path)}
              >
                {sub.initialized ? (
                  <RefreshCwIcon className="size-3.5" />
                ) : (
                  <DownloadIcon className="size-3.5" />
                )}
                {sub.initialized ? "Update" : "Init"}
              </Button>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-2">
          <Button size="sm" className="w-full" disabled={busy} onClick={() => void updateAll()}>
            <RefreshCwIcon className="size-3.5" />
            Update All Submodules
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
