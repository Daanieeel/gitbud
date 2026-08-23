import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CommitAuthorAvatar } from "./CommitList";
import { useCommitDetail } from "@/hooks/queries/useCommitDetail";
import { useTags } from "@/hooks/queries/useTags";
import { useGitHubStore } from "@/store/useGitHubStore";
import { copyToClipboard } from "@/lib/clipboard";

interface CommitHeaderProps {
  repoPath: string | null;
  oid: string;
}

/** Sits above the file explorer + diff viewer once a commit is selected: full message, authors
 * (including any co-authors), date, a copiable hash, the diffstat, and any tags pointing here. */
export function CommitHeader({ repoPath, oid }: CommitHeaderProps) {
  const { data: detail } = useCommitDetail(repoPath, oid);
  const { data: tags = [] } = useTags(repoPath, true);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!detail) return null;

  const matchingTags = tags.filter((t) => t.oid === oid);

  return (
    <div className="flex max-h-[300px] shrink-0 flex-col gap-1.5 overflow-auto border-b border-border px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        {matchingTags.map((t) => (
          <span
            key={t.name}
            className="shrink-0 rounded bg-secondary px-1 py-0.5 font-mono text-[10px] text-secondary-foreground"
          >
            {t.name}
          </span>
        ))}
        <span className="truncate text-sm font-medium">{detail.summary}</span>
      </div>
      {detail.description && (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">{detail.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center -space-x-1.5">
          {detail.authors.map((a) => (
            <Tooltip key={a.email}>
              <TooltipTrigger asChild>
                <span className="rounded-full ring-2 ring-background">
                  <CommitAuthorAvatar
                    repoPath={repoPath}
                    login={currentLogin}
                    email={a.email}
                    initial={(a.name || a.email || "?").trim().charAt(0).toUpperCase()}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>{a.name || a.email}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <span>{format(new Date(detail.timestamp * 1000), "PPp")}</span>
        <button
          type="button"
          onClick={() => {
            void copyToClipboard(detail.oid);
            setCopied(true);
          }}
          className="flex items-center gap-1 font-mono hover:text-foreground"
        >
          {detail.short_oid}
          {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
        </button>
        <span className="text-accent-green">+{detail.insertions}</span>
        <span className="text-accent-pink">-{detail.deletions}</span>
      </div>
    </div>
  );
}
