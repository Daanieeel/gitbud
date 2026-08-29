import {
  CheckCircle2Icon,
  CircleDashedIcon,
  MessageSquareIcon,
  UsersIcon,
  XCircleIcon,
} from "lucide-react";
import { Avatar } from "@gitbud/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { MultiSelectField } from "./MultiSelectField";
import {
  teamReviewerKey,
  useAssignableUsers,
  useRepoTeams,
  useSyncReviewers,
} from "@/hooks/queries/usePRMetadataOptions";
import { useReviews } from "@/hooks/queries/usePRConversation";
import { deriveReviewerStatus, type ReviewerStatus } from "@/lib/reviewerStatus";
import type { PullRequest } from "@/lib/types";

interface PRSidebarReviewersProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
  pollIntervalMs: number | null;
}

const STATUS_ICON = {
  approved: CheckCircle2Icon,
  changes_requested: XCircleIcon,
  commented: MessageSquareIcon,
  dismissed: CircleDashedIcon,
  pending: CircleDashedIcon,
} satisfies Record<ReviewerStatus, typeof CheckCircle2Icon>;

const STATUS_COLOR = {
  approved: "text-accent-green",
  changes_requested: "text-accent-pink",
  commented: "text-muted-foreground",
  dismissed: "text-muted-foreground",
  pending: "text-accent-yellow",
} satisfies Record<ReviewerStatus, string>;

const STATUS_LABEL = {
  approved: "Approved",
  changes_requested: "Changes requested",
  commented: "Commented",
  dismissed: "Review dismissed",
  pending: "Review pending",
} satisfies Record<ReviewerStatus, string>;

export function PRSidebarReviewers({
  repoPath,
  login,
  pr,
  pollIntervalMs,
}: PRSidebarReviewersProps) {
  const { data: assignableUsers = [] } = useAssignableUsers(repoPath, login);
  const { data: teams = [] } = useRepoTeams(repoPath, login);
  const { reviews } = useReviews(repoPath, login, pr.number, pollIntervalMs);
  const syncReviewers = useSyncReviewers(repoPath, login, pr.number);

  const reviewers = deriveReviewerStatus(pr.requested_reviewers, reviews);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Reviewers</span>
      {(reviewers.length > 0 || pr.requested_teams.length > 0) && (
        <div className="flex flex-col gap-1">
          {reviewers.map((r) => {
            const Icon = STATUS_ICON[r.status];
            return (
              <div key={r.login} className="flex items-center gap-1.5 text-sm">
                <Avatar src={r.avatar_url} alt={r.login} className="size-5" />
                <span className="min-w-0 flex-1 truncate">{r.login}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Icon className={`size-3.5 shrink-0 ${STATUS_COLOR[r.status]}`} />
                  </TooltipTrigger>
                  <TooltipContent>{STATUS_LABEL[r.status]}</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
          {/* Teams have no per-team review verdict of their own (individual members review, not
           * the team) — GitHub's own UI shows a requested team the same "pending" way regardless
           * of whether some members have already reviewed individually, so this mirrors that
           * rather than trying to roll up member statuses into one team-level verdict. */}
          {pr.requested_teams.map((team) => (
            <div key={team.slug} className="flex items-center gap-1.5 text-sm">
              <UsersIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CircleDashedIcon className="size-3.5 shrink-0 text-accent-yellow" />
                </TooltipTrigger>
                <TooltipContent>Review pending</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      )}
      <MultiSelectField
        placeholder="No reviewers"
        label=""
        hideChips
        options={[
          ...assignableUsers.map((u) => ({
            key: u.login,
            label: u.login,
            slotLeft: <img src={u.avatar_url} alt="" className="size-4 rounded-full" />,
          })),
          ...teams.map((t) => ({
            key: teamReviewerKey(t.slug),
            label: `${t.name} (team)`,
            slotLeft: <UsersIcon className="size-4 text-muted-foreground" />,
          })),
        ]}
        selected={[
          ...pr.requested_reviewers.map((r) => r.login),
          ...pr.requested_teams.map((t) => teamReviewerKey(t.slug)),
        ]}
        onChange={(next) => syncReviewers.mutate(next)}
      />
    </div>
  );
}
