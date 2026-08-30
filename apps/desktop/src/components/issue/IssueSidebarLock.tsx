import { useState } from "react";
import { LockIcon, LockOpenIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { useSetIssueConversationLocked } from "@/hooks/queries/useIssueMeta";
import type { Issue } from "@/lib/types";

interface IssueSidebarLockProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

const LOCK_REASONS: { key: string; label: string }[] = [
  { key: "off-topic", label: "Off-topic" },
  { key: "too heated", label: "Too heated" },
  { key: "resolved", label: "Resolved" },
  { key: "spam", label: "Spam" },
];

/** Mirrors `PRSidebarLock.tsx` — a moderation action, kept visually separate below the
 * metadata sections above it. */
export function IssueSidebarLock({ repoPath, login, issue }: IssueSidebarLockProps) {
  const [open, setOpen] = useState(false);
  const setLocked = useSetIssueConversationLocked(repoPath, login, issue.number);

  if (issue.locked) {
    return (
      <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <LockIcon className="size-3.5 shrink-0" />
          Conversation locked
          {issue.active_lock_reason && <span>({issue.active_lock_reason})</span>}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start"
          disabled={setLocked.isPending}
          onClick={() => setLocked.mutate({ locked: false, lockReason: null })}
        >
          <LockOpenIcon className="size-3.5" />
          Unlock
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="w-full justify-start text-muted-foreground">
            <LockIcon className="size-3.5" />
            Lock conversation
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Lock for a reason (optional)
          </div>
          {LOCK_REASONS.map((r) => (
            <button
              key={r.key}
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
              onClick={() => {
                setLocked.mutate({ locked: true, lockReason: r.key });
                setOpen(false);
              }}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent"
            onClick={() => {
              setLocked.mutate({ locked: true, lockReason: null });
              setOpen(false);
            }}
          >
            No reason
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
