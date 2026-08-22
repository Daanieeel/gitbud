import { useEffect, useState } from "react";
import { ArrowUpFromLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/tauri";
import type { AheadBehind } from "@/lib/types";

interface UpstreamBannerProps {
  repoPath: string;
  branch: string;
}

export function UpstreamBanner({ repoPath, branch }: UpstreamBannerProps) {
  const [status, setStatus] = useState<AheadBehind | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.hasUpstreamRemote(repoPath).then(async (has) => {
      if (!has || cancelled) return;
      const ab = await api.getUpstreamAheadBehind(repoPath, branch).catch(() => null);
      if (!cancelled) setStatus(ab);
    });
    return () => {
      cancelled = true;
    };
  }, [repoPath, branch]);

  if (!status || status.behind === 0) return null;

  const sync = async () => {
    setSyncing(true);
    try {
      await api.syncUpstream(repoPath, branch);
      setStatus(await api.getUpstreamAheadBehind(repoPath, branch));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted px-3 py-1.5 text-xs">
      <span>
        Upstream is {status.behind} commit{status.behind === 1 ? "" : "s"} ahead.
      </span>
      <Button size="sm" variant="outline" disabled={syncing} onClick={() => void sync()}>
        <ArrowUpFromLineIcon className="size-3.5" />
        {syncing ? "Syncing…" : "Fetch Upstream & Fast-Forward"}
      </Button>
    </div>
  );
}
