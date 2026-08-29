import { CheckCircle2Icon, CircleDashedIcon, TriangleAlertIcon, XCircleIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { useCheckRuns, prPollIntervalMs, useIsPrTabActive } from "@/hooks/queries/useCheckRuns";
import { useReviews } from "@/hooks/queries/usePRConversation";
import {
  useBranchProtectionRequirements,
  useComparePullRequestBase,
  useUpdatePullRequestBranch,
} from "@/hooks/queries/usePRMergeReadiness";
import { deriveReviewerStatus } from "@/lib/reviewerStatus";
import { mergeReadiness, type ChecksState, type ConflictState } from "@/lib/mergeReadiness";
import type { PullRequest } from "@/lib/types";

interface PRMergeReadinessProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

const CHECKS_ICON = {
  passing: CheckCircle2Icon,
  failing: XCircleIcon,
  pending: CircleDashedIcon,
  none: CircleDashedIcon,
} satisfies Record<ChecksState, typeof CheckCircle2Icon>;

const CHECKS_LABEL = {
  passing: "All checks passing",
  failing: "Some checks failing",
  pending: "Checks pending",
  none: "No checks reported",
} satisfies Record<ChecksState, string>;

const CONFLICT_LABEL = {
  clean: "No conflicts with the base branch",
  conflicted: "This branch has conflicts with the base branch",
  unknown: "Checking for conflicts…",
} satisfies Record<ConflictState, string>;

/** Not shown at all once the PR is closed/merged — nothing here is actionable anymore. */
export function PRMergeReadiness({ repoPath, login, pr }: PRMergeReadinessProps) {
  const isPrTabActive = useIsPrTabActive();
  const pollIntervalMs = prPollIntervalMs(pr, isPrTabActive, true);
  const { data: runs = null } = useCheckRuns(repoPath, login, pr.head_sha, pollIntervalMs);
  const { reviews } = useReviews(repoPath, login, pr.number, pollIntervalMs);
  const { data: requirements } = useBranchProtectionRequirements(repoPath, login, pr.base_ref);
  const { data: compare } = useComparePullRequestBase(repoPath, login, pr.base_ref, pr.head_ref);
  const updateBranch = useUpdatePullRequestBranch(repoPath, login, pr.number);

  if (pr.merged || pr.state !== "open") return null;

  const reviewerStatuses = deriveReviewerStatus(pr.requested_reviewers, reviews);
  const readiness = mergeReadiness(
    pr,
    runs,
    requirements?.required_contexts ?? [],
    reviewerStatuses,
    requirements?.required_approving_review_count ?? null,
    compare ?? null,
  );

  const ChecksIcon = CHECKS_ICON[readiness.checksState];

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
      <div className="flex items-center gap-2">
        <ChecksIcon
          className={`size-4 shrink-0 ${
            readiness.checksState === "passing"
              ? "text-accent-green"
              : readiness.checksState === "failing"
                ? "text-accent-pink"
                : "text-accent-yellow"
          }`}
        />
        <span>{CHECKS_LABEL[readiness.checksState]}</span>
      </div>
      <div className="flex items-center gap-2">
        {readiness.reviewsState === "met" ? (
          <CheckCircle2Icon className="size-4 shrink-0 text-accent-green" />
        ) : (
          <CircleDashedIcon className="size-4 shrink-0 text-accent-yellow" />
        )}
        <span>
          {readiness.reviewsState === "met"
            ? "Review requirements met"
            : "Waiting on required reviews"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {readiness.conflictState === "conflicted" ? (
          <TriangleAlertIcon className="size-4 shrink-0 text-destructive" />
        ) : (
          <CheckCircle2Icon
            className={`size-4 shrink-0 ${
              readiness.conflictState === "clean" ? "text-accent-green" : "text-accent-yellow"
            }`}
          />
        )}
        <span>{CONFLICT_LABEL[readiness.conflictState]}</span>
      </div>
      {readiness.behindBy > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-accent-yellow/10 p-2">
          <span className="text-accent-yellow">
            This branch is {readiness.behindBy} commit{readiness.behindBy > 1 ? "s" : ""} behind{" "}
            {pr.base_ref}.
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={updateBranch.isPending}
            onClick={() => updateBranch.mutate()}
          >
            {updateBranch.isPending ? "Updating…" : "Update branch"}
          </Button>
        </div>
      )}
    </div>
  );
}
