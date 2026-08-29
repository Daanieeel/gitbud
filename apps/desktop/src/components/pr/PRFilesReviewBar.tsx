import { useState } from "react";
import { CheckIcon, MessageSquareIcon, XIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Textarea } from "@gitbud/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";

interface PRFilesReviewBarProps {
  pendingViewedCount: number;
  isOwnPr: boolean;
  submitting: boolean;
  onSubmit: (event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT", body: string) => Promise<void>;
}

/** Sticky footer pinned to the bottom of the Files tab's file list — batches every "mark as
 * viewed" checkbox tick locally (see `FilesTab.tsx`) rather than sending each one the moment
 * it's clicked, then flushes all of them together with a review verdict when this bar's button
 * is used, matching GitHub's own "finish your review" flow instead of firing a viewed-state
 * mutation per checkbox click. Always visible (`sticky bottom-0` as the list's last child, with
 * matching bottom padding on the list itself so it never covers the last row) rather than
 * requiring a scroll to the end to find it. */
export function PRFilesReviewBar({
  pendingViewedCount,
  isOwnPr,
  submitting,
  onSubmit,
}: PRFilesReviewBarProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");

  const submit = async (event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT") => {
    await onSubmit(event, body.trim());
    setBody("");
    setOpen(false);
  };

  return (
    <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-card px-2 py-2 text-xs">
      <span className="text-muted-foreground">
        {pendingViewedCount > 0
          ? `${pendingViewedCount} file${pendingViewedCount === 1 ? "" : "s"} marked, not yet sent`
          : "Review this PR's files"}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="positive" disabled={submitting}>
            {submitting ? "Submitting…" : "Finish review"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-2 p-3">
          <Textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Leave a review comment (optional for Approve/Request changes)"
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={submitting}
              onClick={() => void submit("COMMENT")}
            >
              <MessageSquareIcon className="size-3.5" />
              Comment
            </Button>
            {!isOwnPr && (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={submitting}
                  onClick={() => void submit("REQUEST_CHANGES")}
                >
                  <XIcon className="size-3.5" />
                  Request changes
                </Button>
                <Button
                  size="sm"
                  variant="positive"
                  disabled={submitting}
                  onClick={() => void submit("APPROVE")}
                >
                  <CheckIcon className="size-3.5" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
