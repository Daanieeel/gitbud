import { useEffect, useRef, useState } from "react";
import { Button } from "@gitbud/ui/button";
import { Textarea } from "@gitbud/ui/textarea";
import { useAddIssueComment } from "@/hooks/queries/usePRConversation";
import { usePRStore } from "@/store/usePRStore";

interface PRCommentComposeProps {
  repoPath: string;
  login: string;
  number: number;
}

/** A top-level issue comment box — deliberately separate from `DiffView`'s line-anchored
 * comment composer in `@gitbud/ui` (a different concept: this isn't tied to a diff line at
 * all), so it lives here rather than being threaded into the shared diff package. */
export function PRCommentCompose({ repoPath, login, number }: PRCommentComposeProps) {
  const [body, setBody] = useState("");
  const addComment = useAddIssueComment(repoPath, login, number);

  // A timeline comment's "Quote reply" action queues text here rather than calling into this
  // component directly — picked up once, quoted as markdown, then cleared so it doesn't
  // reappear on the next unrelated render.
  const quotedReplyText = usePRStore((s) => s.quotedReplyText);
  const clearQuotedReply = usePRStore((s) => s.clearQuotedReply);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!quotedReplyText) return;
    const quoted = quotedReplyText
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    setBody((prev) => (prev ? `${prev}\n\n${quoted}\n\n` : `${quoted}\n\n`));
    clearQuotedReply();
    textareaRef.current?.focus();
  }, [quotedReplyText, clearQuotedReply]);

  const submit = async () => {
    if (!body.trim()) return;
    await addComment.mutateAsync(body.trim());
    setBody("");
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        ref={textareaRef}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Leave a comment"
        className="text-sm"
      />
      <Button
        size="sm"
        className="self-end"
        disabled={addComment.isPending || !body.trim()}
        onClick={() => void submit()}
      >
        {addComment.isPending ? "Commenting…" : "Comment"}
      </Button>
    </div>
  );
}
