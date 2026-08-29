import { MoreHorizontalIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@gitbud/ui/dropdown-menu";
import { copyToClipboard } from "@/lib/clipboard";
import { usePRStore } from "@/store/usePRStore";

interface TimelineCommentMenuProps {
  htmlUrl: string;
  body: string;
  /** Only passed for a comment the current user authored — GitHub has no way to delete a
   * review or someone else's comment through this app, so the menu item is simply omitted
   * rather than shown disabled. */
  onDelete?: () => void;
}

/** The three-dot menu on every comment/review card in the timeline. "Quote reply" hands the
 * body off through `usePRStore`'s `quotedReplyText` rather than needing a direct reference to
 * `PRCommentCompose`, which lives in a completely different part of the tab. */
export function TimelineCommentMenu({ htmlUrl, body, onDelete }: TimelineCommentMenuProps) {
  const setQuotedReply = usePRStore((s) => s.setQuotedReply);

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
        <DropdownMenuItem onClick={() => setQuotedReply(body)}>Quote reply</DropdownMenuItem>
        {onDelete && (
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
