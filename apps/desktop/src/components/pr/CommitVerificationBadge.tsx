import { useEffect, useState } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { api } from "@/lib/tauri";

interface CommitVerificationBadgeProps {
  repoPath: string;
  login: string;
  sha: string;
}

/** Same idea as History's private `VerificationBadge` (`CommitList.tsx`), just against a PR
 * commit's sha instead of a local `CommitEntry`'s — the two views have no shared row component
 * to reuse, only the same underlying `githubGetCommitVerification` call. Shared between the
 * Commits tab's rows and the Conversation timeline's commit-pushed rows rather than duplicated
 * in both. */
export function CommitVerificationBadge({ repoPath, login, sha }: CommitVerificationBadgeProps) {
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.githubGetCommitVerification(repoPath, login, sha).then(
      (v) => !cancelled && setVerified(v.verified),
      () => !cancelled && setVerified(null),
    );
    return () => {
      cancelled = true;
    };
  }, [repoPath, login, sha]);

  if (!verified) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <ShieldCheckIcon className="size-3 shrink-0 text-accent-green" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Verified signature</TooltipContent>
    </Tooltip>
  );
}
