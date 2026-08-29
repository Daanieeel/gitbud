import {
  CheckCircle2Icon,
  GitCommitHorizontalIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  MessageSquareIcon,
  TagIcon,
  UserMinusIcon,
  UserPlusIcon,
  XCircleIcon,
} from "lucide-react";
import { Avatar } from "@gitbud/ui/avatar";
import { Markdown } from "@gitbud/ui/markdown";
import type { TimelineEvent } from "@/lib/prTimeline";
import type { IssueTimelineEvent } from "@/lib/types";

const REVIEW_VERDICT = {
  APPROVED: { label: "approved these changes", Icon: CheckCircle2Icon, color: "text-accent-green" },
  CHANGES_REQUESTED: {
    label: "requested changes",
    Icon: XCircleIcon,
    color: "text-accent-pink",
  },
  COMMENTED: { label: "commented", Icon: MessageSquareIcon, color: "text-muted-foreground" },
  DISMISSED: { label: "review dismissed", Icon: MessageSquareIcon, color: "text-muted-foreground" },
} satisfies Record<string, { label: string; Icon: typeof CheckCircle2Icon; color: string }>;

const GITHUB_EVENT_LABEL = {
  labeled: (e: IssueTimelineEvent) => `added the ${e.label_name ?? "?"} label`,
  unlabeled: (e: IssueTimelineEvent) => `removed the ${e.label_name ?? "?"} label`,
  assigned: (e: IssueTimelineEvent) => `assigned ${e.assignee_login ?? "someone"}`,
  unassigned: (e: IssueTimelineEvent) => `unassigned ${e.assignee_login ?? "someone"}`,
  review_requested: (e: IssueTimelineEvent) =>
    `requested review from ${e.requested_reviewer_login ?? "someone"}`,
  review_request_removed: (e: IssueTimelineEvent) =>
    `removed the review request for ${e.requested_reviewer_login ?? "someone"}`,
  closed: () => "closed this pull request",
  reopened: () => "reopened this pull request",
  merged: () => "merged this pull request",
} satisfies Record<string, (e: IssueTimelineEvent) => string>;

const GITHUB_EVENT_ICON = {
  labeled: TagIcon,
  unlabeled: TagIcon,
  assigned: UserPlusIcon,
  unassigned: UserMinusIcon,
  review_requested: UserPlusIcon,
  review_request_removed: UserMinusIcon,
  closed: GitPullRequestClosedIcon,
  reopened: GitPullRequestClosedIcon,
  merged: GitMergeIcon,
} satisfies Record<string, typeof CheckCircle2Icon>;

/** Looks up an open string key against a known-literal lookup table without widening the
 * table's own declared type — the table stays `satisfies`-checked against its value type, and
 * only this generic boundary (not the table itself) admits an arbitrary `string` key. */
function lookup<T>(map: Record<string, T>, key: string, fallback: T): T {
  return Object.hasOwn(map, key) ? map[key] : fallback;
}

function formatTimestamp(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

export function PRTimelineEvent({ event }: { event: TimelineEvent }) {
  if (event.kind === "commit") {
    const { commit } = event;
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GitCommitHorizontalIcon className="size-3.5 shrink-0" />
        {commit.author_avatar_url && (
          <Avatar
            src={commit.author_avatar_url}
            alt={commit.author_login ?? ""}
            className="size-4"
          />
        )}
        <span className="min-w-0 flex-1 truncate">{commit.summary}</span>
        <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-secondary-foreground">
          {commit.sha.slice(0, 7)}
        </span>
      </div>
    );
  }

  if (event.kind === "review") {
    const { review } = event;
    const verdict = lookup(REVIEW_VERDICT, review.state, REVIEW_VERDICT.COMMENTED);
    const { Icon } = verdict;
    return (
      <div className="flex gap-2 rounded-md border border-border p-3">
        <Avatar src={review.user_avatar_url} alt={review.user_login} className="size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5 text-xs">
            <span className="font-medium">{review.user_login}</span>
            <Icon className={`size-3.5 shrink-0 ${verdict.color}`} />
            <span className="text-muted-foreground">{verdict.label}</span>
            {event.timestamp && (
              <span className="ml-auto shrink-0 text-muted-foreground">
                {formatTimestamp(event.timestamp)}
              </span>
            )}
          </div>
          {review.body && <Markdown content={review.body} />}
        </div>
      </div>
    );
  }

  if (event.kind === "github_event") {
    const { ghEvent } = event;
    const label = lookup(GITHUB_EVENT_LABEL, ghEvent.event, () => ghEvent.event)(ghEvent);
    const Icon = lookup(GITHUB_EVENT_ICON, ghEvent.event, MessageSquareIcon);
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        {ghEvent.actor_avatar_url && (
          <Avatar
            src={ghEvent.actor_avatar_url}
            alt={ghEvent.actor_login ?? ""}
            className="size-4"
          />
        )}
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-foreground">{ghEvent.actor_login ?? "someone"}</span>{" "}
          {label}
        </span>
        {event.timestamp && <span className="shrink-0">{formatTimestamp(event.timestamp)}</span>}
      </div>
    );
  }

  const { comment } = event;
  return (
    <div className="flex gap-2 rounded-md border border-border p-3">
      <Avatar src={comment.user_avatar_url} alt={comment.user_login} className="size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5 text-xs">
          <span className="font-medium">{comment.user_login}</span>
          <span className="text-muted-foreground">commented</span>
          <span className="ml-auto shrink-0 text-muted-foreground">
            {formatTimestamp(event.timestamp)}
          </span>
        </div>
        <Markdown content={comment.body} />
      </div>
    </div>
  );
}
