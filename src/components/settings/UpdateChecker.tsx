import { DownloadIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "@/store/useUpdateStore";

export function UpdateChecker() {
  const [version, setVersion] = useState("");
  const status = useUpdateStore((s) => s.status);
  const update = useUpdateStore((s) => s.update);
  const error = useUpdateStore((s) => s.error);
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);
  const install = useUpdateStore((s) => s.install);

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={status === "checking"} onClick={() => void checkForUpdates()}>
          <RefreshCwIcon className={`size-3.5 ${status === "checking" ? "animate-spin" : ""}`} />
          Check for Updates
        </Button>
        <span className="text-xs text-muted-foreground">Current: v{version}</span>
      </div>
      {status === "up-to-date" && <p className="text-xs text-muted-foreground">You're up to date.</p>}
      {status === "unconfigured" && (
        <p className="text-xs text-muted-foreground">
          This build has no update endpoint configured yet. Auto-update isn't set up for this
          distribution channel.
        </p>
      )}
      {status === "error" && <p className="text-xs text-destructive">{error}</p>}
      {(status === "available" || status === "installing") && update && (
        <div className="rounded-md border border-border p-2">
          <p className="text-sm font-medium">v{update.version} available</p>
          {update.body && <p className="mt-1 text-xs text-muted-foreground">{update.body}</p>}
          <Button size="sm" className="mt-2" disabled={status === "installing"} onClick={() => void install()}>
            <DownloadIcon className="size-3.5" />
            {status === "installing" ? "Downloading…" : "Download & Install"}
          </Button>
        </div>
      )}
    </div>
  );
}
