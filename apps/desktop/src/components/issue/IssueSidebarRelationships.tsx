import { useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleCheckIcon, CircleDotIcon, PlusIcon, XIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@gitbud/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@gitbud/ui/dialog";
import { Input } from "@gitbud/ui/input";
import { useIssueRelationships } from "@/hooks/queries/useIssueRelationships";
import {
  useAddBlockedBy,
  useAddBlocking,
  useAddSubIssue,
  useRemoveBlockedBy,
  useRemoveBlocking,
  useRemoveSubIssue,
} from "@/hooks/queries/useIssueRelationships";
import { useRepoIssues } from "@/hooks/queries/usePRMetadataOptions";
import { useUpdateIssueBody } from "@/hooks/queries/useIssueMeta";
import { useRemoteInfo } from "@/hooks/useRemoteInfo";
import type { Issue, IssueRef } from "@/lib/types";

interface IssueSidebarRelationshipsProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

type PickerMode = "parent" | "blockedBy" | "blocking" | "relatesTo";

const PICKER_TITLE = {
  parent: "Add parent",
  blockedBy: "Mark as blocked by",
  blocking: "Mark as blocking",
  relatesTo: "Add relates to",
} satisfies Record<PickerMode, string>;

function RelationshipChip({
  prefix,
  issueRef,
  onRemove,
  removing,
  onOpen,
}: {
  prefix: string;
  issueRef: IssueRef;
  onRemove: () => void;
  removing: boolean;
  onOpen: () => void;
}) {
  const closed = issueRef.state.toLowerCase() === "closed";
  return (
    <div className="group flex items-center gap-1.5 text-sm">
      {closed ? (
        <CircleCheckIcon className="size-3.5 shrink-0 text-accent-purple" />
      ) : (
        <CircleDotIcon className="size-3.5 shrink-0 text-accent-green" />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 truncate text-left text-muted-foreground hover:text-foreground"
      >
        <span className="text-xs">{prefix}</span> #{issueRef.number} {issueRef.title}
      </button>
      <button
        type="button"
        disabled={removing}
        onClick={onRemove}
        className="shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

/** GitHub's newer sub-issues (`parent`) and issue-dependencies (`blockedBy`/`blocking`)
 * relationships — both GraphQL-only, no REST equivalent. "Add relates to" has no dedicated
 * relationship API at all (confirmed via GitHub's public GraphQL schema — no mutation exists for
 * it), so it's a lightweight body-text mention instead, the same convention
 * `PRSidebarLinkedIssues.tsx` uses for "Closes #N", just without a closing keyword. "Add security
 * alert" (GitHub's own menu has a 5th item) is left out entirely — it links a Dependabot/code-
 * scanning alert, an unrelated feature with no bearing on issue-to-issue relationships. */
export function IssueSidebarRelationships({
  repoPath,
  login,
  issue,
}: IssueSidebarRelationshipsProps) {
  const { data: relationships } = useIssueRelationships(repoPath, login, issue.number);
  const addSubIssue = useAddSubIssue(repoPath, login, issue.number);
  const removeSubIssue = useRemoveSubIssue(repoPath, login, issue.number);
  const addBlockedBy = useAddBlockedBy(repoPath, login, issue.number);
  const removeBlockedBy = useRemoveBlockedBy(repoPath, login, issue.number);
  const addBlocking = useAddBlocking(repoPath, login, issue.number);
  const removeBlocking = useRemoveBlocking(repoPath, login, issue.number);
  const updateBody = useUpdateIssueBody(repoPath, login, issue.number);
  const { data: repoIssues = [] } = useRepoIssues(repoPath, login);
  const remoteInfo = useRemoteInfo(repoPath);

  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [filter, setFilter] = useState("");

  const candidates = useMemo(
    () =>
      repoIssues.filter(
        (i) => i.number !== issue.number && i.title.toLowerCase().includes(filter.toLowerCase()),
      ),
    [repoIssues, issue.number, filter],
  );

  const openIssue = (number: number) => {
    if (remoteInfo) void openUrl(`${remoteInfo.url}/issues/${number}`);
  };

  const pick = (number: number) => {
    if (pickerMode === "parent") addSubIssue.mutate(number);
    else if (pickerMode === "blockedBy") addBlockedBy.mutate(number);
    else if (pickerMode === "blocking") addBlocking.mutate(number);
    else if (pickerMode === "relatesTo") {
      const line = `Relates to #${number}`;
      if (issue.body?.includes(line)) return;
      updateBody.mutate(issue.body ? `${issue.body}\n\n${line}` : line);
    }
    setPickerMode(null);
    setFilter("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Relationships</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground">
              <PlusIcon className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setPickerMode("parent")}>Add parent</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPickerMode("blockedBy")}>
              Mark as blocked by
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPickerMode("blocking")}>
              Mark as blocking
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPickerMode("relatesTo")}>
              Add relates to
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {relationships?.parent && (
        <RelationshipChip
          prefix="Parent"
          issueRef={relationships.parent}
          removing={removeSubIssue.isPending}
          onOpen={() => openIssue(relationships.parent!.number)}
          onRemove={() => removeSubIssue.mutate(relationships.parent!.number)}
        />
      )}
      {relationships?.blocked_by.map((ref) => (
        <RelationshipChip
          key={`blocked-by-${ref.number}`}
          prefix="Blocked by"
          issueRef={ref}
          removing={removeBlockedBy.isPending}
          onOpen={() => openIssue(ref.number)}
          onRemove={() => removeBlockedBy.mutate(ref.number)}
        />
      ))}
      {relationships?.blocking.map((ref) => (
        <RelationshipChip
          key={`blocking-${ref.number}`}
          prefix="Blocking"
          issueRef={ref}
          removing={removeBlocking.isPending}
          onOpen={() => openIssue(ref.number)}
          onRemove={() => removeBlocking.mutate(ref.number)}
        />
      ))}

      <Dialog
        open={pickerMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPickerMode(null);
            setFilter("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{pickerMode && PICKER_TITLE[pickerMode]}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Filter issues…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8"
          />
          <div className="flex max-h-64 flex-col gap-0.5 overflow-auto">
            {candidates.length === 0 && (
              <div className="p-2 text-center text-xs text-muted-foreground">No matches</div>
            )}
            {candidates.map((candidate) => (
              <button
                key={candidate.number}
                type="button"
                onClick={() => pick(candidate.number)}
                className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
              >
                {candidate.state === "closed" ? (
                  <CircleCheckIcon className="size-3.5 shrink-0 text-accent-purple" />
                ) : (
                  <CircleDotIcon className="size-3.5 shrink-0 text-accent-green" />
                )}
                <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">#{candidate.number}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
