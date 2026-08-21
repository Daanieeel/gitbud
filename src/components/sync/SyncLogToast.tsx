import { useEffect, useState } from "react";
import { useRepoStore } from "@/store/useRepoStore";

const LINGER_MS = 3000;

export function SyncLogToast() {
  const syncing = useRepoStore((s) => s.syncing);
  const syncLog = useRepoStore((s) => s.syncLog);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (syncing) {
      setVisible(true);
      return;
    }
    if (syncLog.length === 0) return;
    const timer = setTimeout(() => setVisible(false), LINGER_MS);
    return () => clearTimeout(timer);
  }, [syncing, syncLog.length]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-h-48 w-96 overflow-auto rounded-md border border-border bg-card p-2 font-mono text-xs shadow-lg">
      {syncLog.length === 0 ? (
        <div className="text-muted-foreground">Working…</div>
      ) : (
        syncLog.map((entry, i) => (
          <div key={i} className={entry.stream === "stderr" ? "text-muted-foreground" : undefined}>
            {entry.line}
          </div>
        ))
      )}
    </div>
  );
}
