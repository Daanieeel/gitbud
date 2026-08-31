import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  GitCommitHorizontalIcon,
  GitMergeIcon,
  GitPullRequestArrowIcon,
  GitPullRequestClosedIcon,
  LinkIcon,
  MessageSquareIcon,
  TagIcon,
  UserMinusIcon,
  UserPlusIcon,
  XCircleIcon,
} from "lucide-react";
import { Avatar } from "@gitbud/ui/avatar";
import { Markdown } from "@gitbud/ui/markdown";
import { TimelineRow } from "./TimelineRow";
import { TimelineCommentMenu } from "./TimelineCommentMenu";
import { RelativeTime } from "../RelativeTime";
import { CIBadge } from "../CIBadge";
import { CommitVerificationBadge } from "../CommitVerificationBadge";
import { LabelChip } from "../LabelChip";
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
  // `labeled`/`unlabeled` are rendered as their own branch below (a colored `LabelChip`, not
  // plain text) so they never reach this table's generic string rendering.
  assigned: (e: IssueTimelineEvent) => `assigned ${e.assignee_login ?? "someone"}`,
  unassigned: (e: IssueTimelineEvent) => `unassigned ${e.assignee_login ?? "someone"}`,
  review_requested: (e: IssueTimelineEvent) =>
    `requested review from ${e.requested_reviewer_login ?? "someone"}`,
  review_request_removed: (e: IssueTimelineEvent) =>
    `removed the review request for ${e.requested_reviewer_login ?? "someone"}`,
  // `closed`/`reopened` fire for both PRs and issues (issues never produce `merged`) — the noun
  // is parameterized so this table is shared between both tabs' timelines.
  closed: (_e: IssueTimelineEvent, noun: string) => `closed this ${noun}`,
  reopened: (_e: IssueTimelineEvent, noun: string) => `reopened this ${noun}`,
  merged: () => "merged this pull request",
} satisfies Record<string, (e: IssueTimelineEvent, noun: string) => string>;

const GITHUB_EVENT_ICON = {
  labeled: TagIcon,
  unlabeled: TagIcon,
  assigned: UserPlusIcon,
  unassigned: UserMinusIcon,
  review_requested: UserPlusIcon,
  review_request_removed: UserMinusIcon,
  closed: GitPullRequestClosedIcon,
  reopened: GitPullRequestArrowIcon,
  merged: GitMergeIcon,
} satisfies Record<string, typeof CheckCircle2Icon>;

/** Icon glyph color per event kind — always applied, independent of `isEmphasized` (which only
 * controls the larger size + colored circle background reserved for the merged/terminal-closed
 * row, see `PRTimeline.tsx`'s terminal-index logic). A non-terminal "closed" or any "reopened"
 * event still gets its color, just at the plain small size. */
const GITHUB_EVENT_COLOR = {
  merged: "text-accent-purple",
  closed: "text-destructive",
  reopened: "text-accent-green",
} satisfies Record<string, string>;

/** Looks up an open string key against a known-literal lookup table without widening the
 * table's own declared type — the table stays `satisfies`-checked against its value type, and
 * only this generic boundary (not the table itself) admits an arbitrary `string` key. */
function lookup<T>(map: Record<string, T>, key: string, fallback: T): T {
  return Object.hasOwn(map, key) ? map[key] : fallback;
}

interface PRTimelineEventProps {
  event: TimelineEvent;
  repoPath: string;
  login: string;
  showTopLine: boolean;
  showBottomLine: boolean;
  onDeleteComment: (commentId: number) => void;
  /** True only for the specific "closed" row `PRTimeline` picked as the current terminal state
   * (see its own doc comment) — a `closed` event fires every time the PR was ever closed, but
   * only the live-current one (PR closed and not merged, with no later reopen) gets the
   * destructive emphasis + line-stop treatment. */
  isTerminalClosed: boolean;
  /** Jumps to the Commits tab with this sha selected — only ever invoked by the `commit` branch
   * below, which never renders for an issue timeline (issues have no commits). */
  onSelectCommit: (sha: string) => void;
  onQuoteReply: (text: string) => void;
  /** "pull request" or "issue" — parameterizes the `closed`/`reopened` event wording so this
   * component is shared between both tabs' timelines. */
  entityNoun: "pull request" | "issue";
}

export function PRTimelineEvent({
  event,
  repoPath,
  login,
  showTopLine,
  showBottomLine,
  onDeleteComment,
  isTerminalClosed,
  onSelectCommit,
  onQuoteReply,
  entityNoun,
}: PRTimelineEventProps) {
  if (event.kind === "commit") {
    const { commit } = event;
    return (
      <TimelineRow
        icon={<GitCommitHorizontalIcon className="size-3.5 text-muted-foreground" />}
        showTopLine={showTopLine}
        showBottomLine={showBottomLine}
      >
        <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
          {commit.author_avatar_url && (
            <Avatar
              src={commit.author_avatar_url}
              alt={commit.author_login ?? ""}
              className="size-4"
            />
          )}
          <span className="min-w-0 flex-1 truncate">{commit.summary}</span>
          {commit.authored_at && <RelativeTime iso={commit.authored_at} className="shrink-0" />}
          <CIBadge repoPath={repoPath} login={login} sha={commit.sha} />
          <CommitVerificationBadge repoPath={repoPath} login={login} sha={commit.sha} />
          <button
            type="button"
            onClick={() => onSelectCommit(commit.sha)}
            className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-secondary-foreground hover:text-foreground"
          >
            {commit.sha.slice(0, 7)}
          </button>
        </div>
      </TimelineRow>
    );
  }

  if (event.kind === "review") {
    const { review } = event;
    const verdict = lookup(REVIEW_VERDICT, review.state, REVIEW_VERDICT.COMMENTED);
    const { Icon } = verdict;
    return (
      <TimelineRow
        icon={<Avatar src={review.user_avatar_url} alt={review.user_login} className="size-6" />}
        showTopLine={showTopLine}
        showBottomLine={showBottomLine}
      >
        <div className="rounded-md border border-border px-3 pt-3.5 pb-3.5">
          <div className="mb-1 flex items-center gap-1.5 text-xs">
            <span className="font-medium">{review.user_login}</span>
            <Icon className={`size-3.5 shrink-0 ${verdict.color}`} />
            <span className="text-muted-foreground">{verdict.label}</span>
            <span className="ml-auto flex shrink-0 items-center gap-2 text-muted-foreground">
              {event.timestamp && <RelativeTime iso={event.timestamp} />}
              <TimelineCommentMenu
                htmlUrl={review.html_url}
                body={review.body}
                onQuoteReply={onQuoteReply}
              />
            </span>
          </div>
          {review.body && <Markdown content={review.body} />}
        </div>
      </TimelineRow>
    );
  }

  if (event.kind === "cross_referenced_group") {
    const { refs, actorLogin, actorAvatarUrl } = event;
    const prCount = refs.filter((r) => r.isPullRequest).length;
    const issueCount = refs.length - prCount;
    const noun =
      issueCount === 0
        ? prCount === 1
          ? "pull request"
          : "pull requests"
        : prCount === 0
          ? issueCount === 1
            ? "issue"
            : "issues"
          : "issues and pull requests";
    // Rendered as two stacked pieces rather than one `TimelineRow` with tall multi-line content:
    // `TimelineRow`'s icon-centering math (see its own doc comment) assumes the content is a
    // single line plus a trailing `pb-4` gap — it aligns correctly only because a one-line row's
    // total height reduces to exactly that. Feeding it the whole header+list block here would
    // center the icon over the *entire* height (title + every ref row), dragging it down well
    // below the title as the list grows. Splitting the title into its own `TimelineRow` gets the
    // proven single-line alignment for free; the ref list continues the same rail manually below
    // it, only as far down as `showBottomLine` (whether another timeline row follows).
    return (
      <>
        <TimelineRow
          icon={<ExternalLinkIcon className="size-3.5 text-muted-foreground" />}
          showTopLine={showTopLine}
          showBottomLine
        >
          <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground">
            {actorAvatarUrl && (
              <Avatar src={actorAvatarUrl} alt={actorLogin ?? ""} className="size-4" />
            )}
            <span className="font-medium text-foreground">{actorLogin ?? "someone"}</span>
            <span>
              mentioned this in {refs.length} {noun}
            </span>
            {event.timestamp && <RelativeTime iso={event.timestamp} className="ml-auto shrink-0" />}
          </div>
        </TimelineRow>
        <div className="flex gap-3">
          <div className="flex w-6 shrink-0 flex-col items-center">
            {showBottomLine && <div className="w-px flex-1 bg-border" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-4 text-xs">
            {refs.map((ref) => {
              const closed = ref.state === "closed" || ref.state === "merged";
              return (
                <div key={ref.number} className="flex items-center gap-2 pl-1">
                  <span
                    className={`size-2 shrink-0 rounded-full border-2 ${
                      closed ? "border-accent-purple" : "border-accent-green"
                    }`}
                  />
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (ref.htmlUrl) void openUrl(ref.htmlUrl);
                    }}
                    className="min-w-0 truncate text-foreground underline hover:text-primary"
                  >
                    {ref.title} <span className="text-muted-foreground">#{ref.number}</span>
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  if (event.kind === "github_event") {
    const { ghEvent } = event;

    if (ghEvent.event === "connected") {
      // "X linked an issue that may be closed by this pull request" — a two-line layout, per
      // the design ask: first line is the sentence + relative time, second line is the linked
      // issue's own title (as a link) + its open/closed state.
      const closed = ghEvent.source_issue_state === "closed";
      return (
        <TimelineRow
          icon={<LinkIcon className="size-3.5 text-muted-foreground" />}
          showTopLine={showTopLine}
          showBottomLine={showBottomLine}
        >
          <div className="flex flex-col gap-1 rounded-md border border-dashed border-border px-3 pt-3.5 pb-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-muted-foreground">
                <span className="font-medium text-foreground">
                  {ghEvent.actor_login ?? "someone"}
                </span>{" "}
                linked an issue that may be closed by this pull request
              </span>
              {event.timestamp && <RelativeTime iso={event.timestamp} className="shrink-0" />}
            </div>
            <div className="flex items-center justify-between gap-2">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (ghEvent.source_issue_html_url) void openUrl(ghEvent.source_issue_html_url);
                }}
                className="min-w-0 truncate text-foreground underline hover:text-primary"
              >
                {ghEvent.source_issue_title}
              </a>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  closed
                    ? "bg-accent-purple/15 text-accent-purple"
                    : "bg-accent-green/15 text-accent-green"
                }`}
              >
                {closed ? "Closed" : "Open"}
              </span>
            </div>
          </div>
        </TimelineRow>
      );
    }

    if (ghEvent.event === "labeled" || ghEvent.event === "unlabeled") {
      const added = ghEvent.event === "labeled";
      return (
        <TimelineRow
          icon={<TagIcon className="size-3.5 text-muted-foreground" />}
          showTopLine={showTopLine}
          showBottomLine={showBottomLine}
        >
          <div className="flex flex-wrap items-center gap-1.5 py-0.5 text-xs text-muted-foreground">
            {ghEvent.actor_avatar_url && (
              <Avatar
                src={ghEvent.actor_avatar_url}
                alt={ghEvent.actor_login ?? ""}
                className="size-4"
              />
            )}
            <span className="font-medium text-foreground">{ghEvent.actor_login ?? "someone"}</span>
            <span>{added ? "added label" : "removed label"}</span>
            <LabelChip name={ghEvent.label_name ?? "?"} color={ghEvent.label_color ?? undefined} />
            {event.timestamp && <RelativeTime iso={event.timestamp} className="ml-auto shrink-0" />}
          </div>
        </TimelineRow>
      );
    }

    const isMerged = ghEvent.event === "merged";
    const isEmphasized = isMerged || isTerminalClosed;
    const iconColor = lookup(GITHUB_EVENT_COLOR, ghEvent.event, "text-muted-foreground");
    const label = lookup(
      GITHUB_EVENT_LABEL,
      ghEvent.event,
      () => ghEvent.event,
    )(ghEvent, entityNoun);
    const Icon = lookup(GITHUB_EVENT_ICON, ghEvent.event, MessageSquareIcon);
    return (
      <TimelineRow
        icon={<Icon className={`${isEmphasized ? "size-4" : "size-3.5"} ${iconColor}`} />}
        showTopLine={showTopLine}
        showBottomLine={showBottomLine}
        emphasized={isEmphasized}
        iconBgClassName={isTerminalClosed ? "bg-destructive/15" : undefined}
      >
        <div
          className={`flex items-center gap-2 py-0.5 ${isEmphasized ? "text-sm" : "text-xs text-muted-foreground"}`}
        >
          {ghEvent.actor_avatar_url && (
            <Avatar
              src={ghEvent.actor_avatar_url}
              alt={ghEvent.actor_login ?? ""}
              className="size-4"
            />
          )}
          <span className="min-w-0 flex-1 truncate">
            <span className={`font-medium ${isEmphasized ? "" : "text-foreground"}`}>
              {ghEvent.actor_login ?? "someone"}
            </span>{" "}
            <span className={isEmphasized ? iconColor : undefined}>{label}</span>
          </span>
          {event.timestamp && <RelativeTime iso={event.timestamp} className="shrink-0" />}
        </div>
      </TimelineRow>
    );
  }

  const { comment } = event;
  return (
    <TimelineRow
      icon={<Avatar src={comment.user_avatar_url} alt={comment.user_login} className="size-6" />}
      showTopLine={showTopLine}
      showBottomLine={showBottomLine}
    >
      <div className="rounded-md border border-border p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs">
          <span className="font-medium">{comment.user_login}</span>
          <span className="text-muted-foreground">commented</span>
          <span className="ml-auto flex shrink-0 items-center gap-2 text-muted-foreground">
            <RelativeTime iso={event.timestamp} />
            <TimelineCommentMenu
              htmlUrl={comment.html_url}
              body={comment.body}
              onDelete={
                comment.user_login === login ? () => onDeleteComment(comment.id) : undefined
              }
              onQuoteReply={onQuoteReply}
            />
          </span>
        </div>
        <Markdown content={comment.body} />
      </div>
    </TimelineRow>
  );
}
