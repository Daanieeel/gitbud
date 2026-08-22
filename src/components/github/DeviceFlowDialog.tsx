import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGitHubStore } from "@/store/useGitHubStore";
import { copyToClipboard } from "@/lib/clipboard";

export function DeviceFlowDialog() {
  const deviceFlow = useGitHubStore((s) => s.deviceFlow);
  const cancelSignIn = useGitHubStore((s) => s.cancelSignIn);
  const [copied, setCopied] = useState(false);

  const deviceCode = deviceFlow?.code.device_code;
  useEffect(() => {
    if (!deviceCode || !deviceFlow) return;
    void openUrl(deviceFlow.code.verification_uri);
    // Only re-open automatically when a new code is issued, not on every status change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceCode]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Dialog open={deviceFlow !== null} onOpenChange={(open) => !open && cancelSignIn()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign in with GitHub</DialogTitle>
          <DialogDescription>
            Enter this code on the GitHub page that just opened in your browser.
          </DialogDescription>
        </DialogHeader>
        {deviceFlow && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-4 py-3">
              <span className="font-mono text-2xl tracking-[0.2em]">{deviceFlow.code.user_code}</span>
              <button
                type="button"
                onClick={() => {
                  void copyToClipboard(deviceFlow.code.user_code);
                  setCopied(true);
                }}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                title="Copy code"
              >
                {copied ? (
                  <CheckIcon className="size-4 text-green-500" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </button>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void openUrl(deviceFlow.code.verification_uri)}
            >
              <ExternalLinkIcon className="size-3.5" />
              Open GitHub
            </Button>
            <div className="flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground">
              {deviceFlow.status === "waiting" && (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  Waiting for approval…
                </>
              )}
              {deviceFlow.status === "denied" && (
                <span className="flex items-center gap-1.5 text-destructive">
                  <TriangleAlertIcon className="size-3.5" />
                  Sign-in was denied.
                </span>
              )}
              {deviceFlow.status === "expired" && (
                <span className="flex items-center gap-1.5 text-destructive">
                  <TriangleAlertIcon className="size-3.5" />
                  This code expired. Close and try again.
                </span>
              )}
              {deviceFlow.status === "error" && (
                <span className="flex items-center gap-1.5 text-destructive">
                  <TriangleAlertIcon className="size-3.5" />
                  {deviceFlow.error ?? "Something went wrong."}
                </span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
