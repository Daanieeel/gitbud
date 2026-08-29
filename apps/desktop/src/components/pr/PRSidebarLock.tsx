import { useState } from "react";
import { LockIcon, LockOpenIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { useSetConversationLocked } from "@/hooks/queries/usePullRequestMeta";
import type { PullRequest } from "@/lib/types";

interface PRSidebarLockProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

const LOCK_REASONS: { key: string; label: string }[] = [
  { key: "off-topic", label: "Off-topic" },
  { key: "too heated", label: "Too heated" },
  { key: "resolved", label: "Resolved" },
  { key: "spam", label: "Spam" },
];

/** Sits at the bottom of the sidebar, below every other section — a moderation action, not
 * PR-review metadata, so it's kept visually separate from labels/reviewers/etc. above it. */
export function PRSidebarLock({ repoPath, login, pr }: PRSidebarLockProps) {
  const [open, setOpen] = useState(false);
  const setLocked = useSetConversationLocked(repoPath, login, pr.number);

  if (pr.locked) {
    return (
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <LockIcon className="size-3.5 shrink-0" />
          Conversation locked
          {pr.active_lock_reason && <span>({pr.active_lock_reason})</span>}
        </span>
        <Button
          size="sm"
          variant="ghost"
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
          <Button size="sm" variant="ghost" className="w-full text-muted-foreground">
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
