import { CircleCheckIcon, CircleDotIcon } from "lucide-react";
import type { SingleSelectOption } from "./SingleSelectField";
import type { IssueSummary } from "@/lib/types";

/** Shared between the sidebar's and the create-PR dialog's "link an issue" pickers — an open
 * issue gets a green `CircleDot`, a closed one a purple `CircleCheck` (matching the read-only
 * linked-issue chips elsewhere), with the repo's full name + issue number as a second line so
 * picking from a long list doesn't require memorizing numbers. */
export function buildIssuePickerOptions(
  issues: IssueSummary[],
  repoFullName: string,
): SingleSelectOption[] {
  const sorted = [...issues].sort((a, b) => {
    if (a.state !== b.state) {
      return a.state === "closed" ? 1 : -1;
    }
    return b.number - a.number;
  });
  return sorted.map((issue) => ({
    key: String(issue.number),
    searchText: issue.title,
    slotLeft:
      issue.state === "closed" ? (
        <CircleCheckIcon className="size-3.5 shrink-0 text-accent-purple" />
      ) : (
        <CircleDotIcon className="size-3.5 shrink-0 text-accent-green" />
      ),
    label: (
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{issue.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {repoFullName}#{issue.number}
        </span>
      </div>
    ),
  }));
}
