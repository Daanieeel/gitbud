import { useState } from "react";
import { CheckIcon, MessageSquareIcon, XIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Textarea } from "@gitbud/ui/textarea";
import { useSubmitReview } from "@/hooks/queries/usePRConversation";

interface PRReviewSubmitProps {
  repoPath: string;
  login: string;
  number: number;
  /** The PR author can't approve/request-changes on their own PR (GitHub rejects it outright) —
   * still allowed to leave a plain comment-only review. */
  isOwnPr: boolean;
}

export function PRReviewSubmit({ repoPath, login, number, isOwnPr }: PRReviewSubmitProps) {
  const [body, setBody] = useState("");
  const submitReview = useSubmitReview(repoPath, login, number);

  const submit = async (event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT") => {
    await submitReview.mutateAsync({ event, body: body.trim() });
    setBody("");
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <span className="text-xs font-medium text-muted-foreground">Review changes</span>
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
          disabled={submitReview.isPending}
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
              disabled={submitReview.isPending}
              onClick={() => void submit("REQUEST_CHANGES")}
            >
              <XIcon className="size-3.5" />
              Request changes
            </Button>
            <Button
              size="sm"
              variant="positive"
              disabled={submitReview.isPending}
              onClick={() => void submit("APPROVE")}
            >
              <CheckIcon className="size-3.5" />
              Approve
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
