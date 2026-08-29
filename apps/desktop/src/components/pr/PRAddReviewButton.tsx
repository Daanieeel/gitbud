import { useState } from "react";
import { Button } from "@gitbud/ui/button";
import { Textarea } from "@gitbud/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { useSubmitReview } from "@/hooks/queries/usePRConversation";
import { ReviewVerdictPicker } from "./ReviewVerdictPicker";
import type { ReviewEvent } from "./reviewOptions";

interface PRAddReviewButtonProps {
  repoPath: string;
  login: string;
  number: number;
  isOwnPr: boolean;
}

const SUBMIT_VARIANT = {
  COMMENT: "secondary",
  APPROVE: "positive",
  REQUEST_CHANGES: "destructive",
} as const;

/** Header-level entry point for submitting a review — the same GitHub "Finish your review"
 * panel as `PRFilesReviewBar`'s popover (`ReviewVerdictPicker`), just without the "files marked
 * as viewed" batching, since this isn't anchored to the Files tab's file list. */
export function PRAddReviewButton({ repoPath, login, number, isOwnPr }: PRAddReviewButtonProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [event, setEvent] = useState<ReviewEvent>("COMMENT");
  const submitReview = useSubmitReview(repoPath, login, number);

  const submit = async () => {
    await submitReview.mutateAsync({ event, body: body.trim() });
    setBody("");
    setEvent("COMMENT");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" disabled={submitReview.isPending}>
          Add review
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
          disabled={submitReview.isPending}
          onClick={() => void submit()}
        >
          {submitReview.isPending ? "Submitting…" : "Submit review"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
