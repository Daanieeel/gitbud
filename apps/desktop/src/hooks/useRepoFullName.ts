import { useEffect, useState } from "react";
import { api } from "@/lib/tauri";

/** `"owner/repo"` for the repo's GitHub remote, or `null` while loading / if there isn't one —
 * used for the "link an issue" picker's `owner/repo#number` subtitle. */
export function useRepoFullName(repoPath: string | null): string | null {
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    setFullName(null);
    if (!repoPath) return;
    let cancelled = false;
    void api.githubRemoteOwnerRepo(repoPath).then((remote) => {
      if (cancelled || !remote) return;
      const [owner, repo] = remote;
      setFullName(`${owner}/${repo}`);
    });
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  return fullName;
}
