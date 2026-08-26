import { useState } from "react";

// Mirrors the min-duration guard in useRepoStore's runSync: a fast local/network op can finish
// faster than a human eye (or even a browser paint) reliably registers, which reads as "the
// loading state never showed" — holding busy for at least this long guarantees it's visible.
const MIN_BUSY_MS = 400;

/** Runs an async action while flipping `busy` true, guaranteeing it stays true for at least
 * MIN_BUSY_MS so a disabled/spinner state tied to it is never too brief to notice. */
export function useBusyAction() {
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    const startedAt = Date.now();
    setBusy(true);
    try {
      await fn();
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_BUSY_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_BUSY_MS - elapsed));
      }
      setBusy(false);
    }
  };

  return [busy, run] as const;
}
