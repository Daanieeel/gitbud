import { useEffect, useState } from "react";
import { api } from "@/lib/tauri";
import { detectRemoteProvider, type RemoteProvider } from "@/lib/remote-provider";

/** The repo's remote web URL + detected provider, refetched whenever `repoPath` changes. `null`
 * while loading, with no remote configured, or before a repo is selected. */
export function useRemoteInfo(
  repoPath: string | null,
): { url: string; provider: RemoteProvider } | null {
  const [remoteInfo, setRemoteInfo] = useState<{ url: string; provider: RemoteProvider } | null>(
    null,
  );

  useEffect(() => {
    setRemoteInfo(null);
    if (!repoPath) return;
    let cancelled = false;
    void api.remoteWebInfo(repoPath).then((info) => {
      if (cancelled || !info) return;
      const [host, url] = info;
      setRemoteInfo({ url, provider: detectRemoteProvider(host) });
    });
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  return remoteInfo;
}
