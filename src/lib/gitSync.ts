import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { notify } from "@/lib/notify";
import { useNetworkStore } from "@/store/useNetworkStore";
import type { GitOutputLine } from "@/lib/types";

// Mirrors git_shell.rs's `event_channel` — Tauri event names only allow `[a-zA-Z0-9-/:_]`, but
// `eventId` is a filesystem path that can contain spaces and other disallowed characters (e.g.
// this repo's own ".../Open Source/gitbud"). Encoding it as base64url keeps both sides in sync
// without ever producing a character `listen()` would reject.
function eventChannel(eventId: string): string {
  const bytes = new TextEncoder().encode(eventId);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  const b64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `git://${b64}`;
}

// Backend has its own 45s no-output watchdog (git_shell.rs), but that only protects against
// git itself going quiet — not against a hung/unresponsive backend, a stale build missing
// that fix, or the IPC event just never arriving. This is the hard client-side backstop: no
// matter what, the UI recovers after this long and the underlying op is asked to cancel.
const SYNC_TIMEOUT_MS = 90_000;

const NOTIFY_THRESHOLD_MS = 4000;

/** Runs a long-lived git operation (fetch/pull/push/clone/...) with a cancellable, progress-
 * streaming toast. Shared by every mutation that wraps a git_shell.rs command, so the toast/
 * cancel/timeout/offline-detection behavior stays identical across all of them. `eventId` is the
 * repo path (or clone destination) — it's both the toast id and the git_shell event channel key. */
export async function runGitSync(
  eventId: string,
  action: () => Promise<void>,
  opts?: {
    description: string;
    doneMessage: string;
    repoName?: string;
    /** Called with the error message when `action` throws. Returning true means the caller
     * already presented its own recovery UI for it — skip the generic error toast (the loading
     * toast is still dismissed either way). */
    onError?: (message: string) => boolean;
  },
) {
  const startedAt = Date.now();
  const label = opts?.description ?? "Working…";
  let resolveCancelled: () => void;
  const cancelled = new Promise<"cancelled">((resolve) => {
    resolveCancelled = () => resolve("cancelled");
  });
  const cancelAction = {
    label: "Cancel",
    onClick: () => {
      void api.cancelGitOperation(eventId).catch(() => {});
      resolveCancelled();
    },
  };
  // closeButton: false — the Toaster's global close button would otherwise sit right next to
  // our own Cancel action and looks like the obvious way to cancel, but it only dismisses the
  // toast client-side without calling cancelAction.onClick, leaving the caller's pending state
  // stuck forever.
  toast.loading(label, { id: eventId, description: undefined, cancel: cancelAction, closeButton: false });

  let unlisten: (() => void) | undefined;
  try {
    unlisten = await listen<GitOutputLine>(eventChannel(eventId), (event) => {
      toast.loading(label, { id: eventId, description: event.payload.line, cancel: cancelAction, closeButton: false });
    });
    const settled = action().then(
      () => ({ ok: true as const }),
      (err: unknown) => ({ ok: false as const, error: String(err) }),
    );
    const timedOut = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), SYNC_TIMEOUT_MS);
    });
    const outcome = await Promise.race([settled, timedOut, cancelled]);
    // Stop reacting to further output lines the instant the outcome is known — a line arriving
    // right as the process exits (e.g. git's own "branch 'x' set up to track 'origin/x'." on a
    // first push) would otherwise re-render this toast as loading (with the Cancel button back)
    // after we've already moved on to rendering its final state below.
    unlisten();
    unlisten = undefined;
    // sonner merges options into the existing toast for this id rather than replacing them, so
    // every final-state call below must explicitly clear `cancel`/`closeButton` — otherwise they
    // silently inherit the Cancel action and the disabled close button from the loading state.
    const finalState = { cancel: undefined, closeButton: true };

    // Deliberately doesn't throw on cancel/timeout/failure — every caller still needs to
    // refresh afterward (e.g. an aborted pull leaves status needing a refresh to show the
    // restored clean state), so this always returns normally and lets the caller's post-sync
    // invalidation run unconditionally, exactly like it would after a clean success.
    if (outcome === "cancelled") {
      toast(`${label.replace(/…$/, "")} cancelled`, { id: eventId, ...finalState });
      return;
    }
    if (outcome === "timeout") {
      void api.cancelGitOperation(eventId).catch(() => {});
      const message = `${label.replace(/…$/, "")} timed out after ${SYNC_TIMEOUT_MS / 1000}s with no response and was cancelled.`;
      toast.error(message, { id: eventId, ...finalState });
      useNetworkStore.getState().noteError(message);
      return;
    }
    if (!outcome.ok) {
      useNetworkStore.getState().noteError(outcome.error);
      if (opts?.onError?.(outcome.error)) {
        toast.dismiss(eventId);
        return;
      }
      toast.error(outcome.error, { id: eventId, ...finalState });
      return;
    }
    useNetworkStore.getState().noteSuccess();
    if (opts) {
      toast.success(opts.doneMessage, { id: eventId, ...finalState });
      if (Date.now() - startedAt > NOTIFY_THRESHOLD_MS) {
        void notify(opts.doneMessage, opts.repoName ?? eventId);
      }
    } else {
      toast.dismiss(eventId);
    }
  } finally {
    unlisten?.();
  }
}
