import { useEffect, useState } from "react";
import { DownloadIcon, RefreshCwIcon } from "lucide-react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "@/components/ui/button";

type Status = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error" | "unconfigured";

export function UpdateChecker() {
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  const checkForUpdates = async () => {
    setStatus("checking");
    setError(null);
    try {
      const result = await check();
      if (result) {
        setUpdate(result);
        setStatus("available");
      } else {
        setStatus("up-to-date");
      }
    } catch (e) {
      const message = String(e);
      // The updater plugin has no endpoint/signing key configured for this build yet.
      if (/endpoint|url/i.test(message)) {
        setStatus("unconfigured");
      } else {
        setStatus("error");
        setError(message);
      }
    }
  };

  const install = async () => {
    if (!update) return;
    setStatus("downloading");
    setError(null);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  };

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
      {(status === "available" || status === "downloading") && update && (
        <div className="rounded-md border border-border p-2">
          <p className="text-sm font-medium">v{update.version} available</p>
          {update.body && <p className="mt-1 text-xs text-muted-foreground">{update.body}</p>}
          <Button size="sm" className="mt-2" disabled={status === "downloading"} onClick={() => void install()}>
            <DownloadIcon className="size-3.5" />
            {status === "downloading" ? "Downloading…" : "Download & Install"}
          </Button>
        </div>
      )}
    </div>
  );
}
