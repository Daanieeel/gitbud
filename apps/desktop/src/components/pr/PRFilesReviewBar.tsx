import { useState } from "react";
import { Button } from "@gitbud/ui/button";
import { Textarea } from "@gitbud/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { ReviewVerdictPicker } from "./ReviewVerdictPicker";
import type { ReviewEvent } from "./reviewOptions";

interface PRFilesReviewBarProps {
  pendingViewedCount: number;
  isOwnPr: boolean;
  submitting: boolean;
  onSubmit: (event: ReviewEvent, body: string) => Promise<void>;
}

const SUBMIT_VARIANT = {
  COMMENT: "secondary",
  APPROVE: "positive",
  REQUEST_CHANGES: "destructive",
} as const;

/** Sticky footer pinned to the bottom of the Files tab's file list — batches every "mark as
 * viewed" checkbox tick locally (see `FilesTab.tsx`) rather than sending each one the moment
 * it's clicked, then flushes all of them together with a review verdict when this bar's button
 * is used, matching GitHub's own "finish your review" flow instead of firing a viewed-state
 * mutation per checkbox click. Always visible (`sticky bottom-0` as the list's last child, with
 * matching bottom padding on the list itself so it never covers the last row) rather than
 * requiring a scroll to the end to find it. The popover itself mirrors GitHub's own "Finish your
 * review" panel: a single radio choice (`ReviewVerdictPicker`), not three separate verdict
 * buttons, followed by one "Submit review" action. */
export function PRFilesReviewBar({
  pendingViewedCount,
  isOwnPr,
  submitting,
  onSubmit,
}: PRFilesReviewBarProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [event, setEvent] = useState<ReviewEvent>("COMMENT");

  const submit = async () => {
    await onSubmit(event, body.trim());
    setBody("");
    setEvent("COMMENT");
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
        <PopoverContent align="end" className="w-80 space-y-3 p-3">
          <Textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Leave a review comment (optional for Approve/Request changes)"
            className="text-sm"
          />
          <ReviewVerdictPicker value={event} onChange={setEvent} isOwnPr={isOwnPr} />
          <Button
            size="sm"
            variant={SUBMIT_VARIANT[event]}
            className="w-full"
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? "Submitting…" : "Submit review"}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
