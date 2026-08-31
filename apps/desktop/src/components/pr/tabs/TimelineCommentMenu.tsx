import { MoreHorizontalIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@gitbud/ui/dropdown-menu";
import { copyToClipboard } from "@/lib/clipboard";

interface TimelineCommentMenuProps {
  htmlUrl: string;
  body: string;
  /** Only passed for a comment the current user authored — GitHub has no way to delete a
   * review or someone else's comment through this app, so the menu item is simply omitted
   * rather than shown disabled. */
  onDelete?: () => void;
  /** Hands the comment body off to whatever compose box lives elsewhere in this tab (a PR's
   * `PRCommentCompose` or an issue's) — shared between both the PR and Issues tabs, which each
   * keep their own quoted-reply state (`usePRStore`/`useIssueStore`). */
  onQuoteReply: (text: string) => void;
}

/** The three-dot menu on every comment/review card in the timeline. */
export function TimelineCommentMenu({
  htmlUrl,
  body,
  onDelete,
  onQuoteReply,
}: TimelineCommentMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontalIcon className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void copyToClipboard(htmlUrl)}>Copy link</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void copyToClipboard(body)}>
          Copy Markdown
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onQuoteReply(body)}>Quote reply</DropdownMenuItem>
        {onDelete && (
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
