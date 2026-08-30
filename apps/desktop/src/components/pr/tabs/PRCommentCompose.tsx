import { useEffect, useRef, useState } from "react";
import { Button } from "@gitbud/ui/button";
import { MarkdownEditor, type MarkdownEditorHandle } from "@gitbud/markdown/editor";
import { useAddIssueComment } from "@/hooks/queries/usePRConversation";
import { api } from "@/lib/tauri";

interface PRCommentComposeProps {
  repoPath: string;
  login: string;
  number: number;
  /** A timeline comment's "Quote reply" action queues text through the caller's own store
   * (`usePRStore`/`useIssueStore`, whichever tab this is rendered in) rather than calling into
   * this component directly — picked up once, quoted as markdown, then cleared via
   * `onConsumeQuotedReply` so it doesn't reappear on the next unrelated render. */
  quotedReplyText: string | null;
  onConsumeQuotedReply: () => void;
}

/** A top-level issue comment box — deliberately separate from `DiffView`'s line-anchored
 * comment composer in `@gitbud/ui` (a different concept: this isn't tied to a diff line at
 * all), so it lives here rather than being threaded into the shared diff package. Shared as-is
 * between the PR and Issues tabs (both post to the same `/issues/{number}/comments` endpoint),
 * so this one `@gitbud/markdown` wiring covers comments in both places. */
export function PRCommentCompose({
  repoPath,
  login,
  number,
  quotedReplyText,
  onConsumeQuotedReply,
}: PRCommentComposeProps) {
  const [body, setBody] = useState("");
  const addComment = useAddIssueComment(repoPath, login, number);
  const editorRef = useRef<MarkdownEditorHandle>(null);

  useEffect(() => {
    if (!quotedReplyText) return;
    const quoted = quotedReplyText
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    setBody((prev) => (prev ? `${prev}\n\n${quoted}\n\n` : `${quoted}\n\n`));
    onConsumeQuotedReply();
    editorRef.current?.focus();
  }, [quotedReplyText, onConsumeQuotedReply]);

  const uploadImage = async (file: File): Promise<string> => {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    return api.githubUploadAttachment(repoPath, login, file.name, file.type, bytes);
  };

  const submit = async () => {
    if (!body.trim()) return;
    await addComment.mutateAsync(body.trim());
    setBody("");
  };

  return (
    <div className="flex flex-col gap-2">
      <MarkdownEditor
        ref={editorRef}
        value={body}
        onChange={setBody}
        placeholder="Leave a comment"
        onUploadImage={uploadImage}
        className="min-h-[160px]"
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
