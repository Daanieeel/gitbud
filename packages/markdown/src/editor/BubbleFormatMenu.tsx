import { BubbleMenu } from "@tiptap/react/menus";
import { useEditorState, type Editor } from "@tiptap/react";
import { BoldIcon, CodeIcon, ItalicIcon, StrikethroughIcon } from "lucide-react";
import { cn } from "@gitbud/ui/utils";
import { LinkPopover } from "./LinkPopover";

interface BubbleFormatMenuProps {
  editor: Editor;
}

function ToolbarButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** The floating formatting toolbar shown on a non-empty text selection — Linear's own editor has
 * no persistent toolbar at all, relying entirely on this plus the `/` menu; this app adds a
 * persistent bottom `Toolbar` on top for users less familiar with markdown, so the two are
 * deliberately redundant paths to the same commands rather than the only way to format text. */
export function BubbleFormatMenu({ editor }: BubbleFormatMenuProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
    }),
  });

  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md"
    >
      <ToolbarButton active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <BoldIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <StrikethroughIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton active={state.code} onClick={() => editor.chain().focus().toggleCode().run()}>
        <CodeIcon className="size-3.5" />
      </ToolbarButton>
      <LinkPopover editor={editor} active={state.link} />
    </BubbleMenu>
  );
}
