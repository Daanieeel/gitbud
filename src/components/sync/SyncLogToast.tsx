import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRepoStore } from "@/store/useRepoStore";

const LINGER_MS = 3000;
const ERROR_LINGER_MS = 10000;

export function SyncLogToast() {
  const syncing = useRepoStore((s) => s.syncing);
  const syncLog = useRepoStore((s) => s.syncLog);
  const syncError = useRepoStore((s) => s.syncError);
  const syncDescription = useRepoStore((s) => s.syncDescription);
  const cancelSync = useRepoStore((s) => s.cancelSync);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (syncing) {
      setVisible(true);
      return;
    }
    if (syncError) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), ERROR_LINGER_MS);
      return () => clearTimeout(timer);
    }
    if (syncLog.length === 0) return;
    const timer = setTimeout(() => setVisible(false), LINGER_MS);
    return () => clearTimeout(timer);
  }, [syncing, syncError, syncLog.length]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-96 flex-col gap-1.5 rounded-md border border-border bg-card p-2 shadow-lg">
      {syncError && (
        <div className="rounded-sm bg-destructive/10 px-1.5 py-1 text-xs text-destructive">{syncError}</div>
      )}
      <div className="max-h-40 overflow-auto font-mono text-xs">
        {syncLog.length === 0 ? (
          <div className="text-muted-foreground">{syncDescription ?? "Working…"}</div>
        ) : (
          syncLog.map((entry, i) => (
            <div key={i} className={entry.stream === "stderr" ? "text-muted-foreground" : undefined}>
              {entry.line}
            </div>
          ))
        )}
      </div>
      {syncing && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 self-end gap-1 px-2 text-xs"
          onClick={() => void cancelSync()}
        >
          <XIcon className="size-3" />
          Cancel
        </Button>
      )}
    </div>
  );
}
