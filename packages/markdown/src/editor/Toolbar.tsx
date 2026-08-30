import { useEditorState, type Editor } from "@tiptap/react";
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  SquareCodeIcon,
  StrikethroughIcon,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { cn } from "@gitbud/ui/utils";
import { LinkPopover } from "./LinkPopover";

export type EditorMode = "rich" | "raw";

interface ToolbarProps {
  editor: Editor;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
}

interface ToolbarAction {
  label: string;
  icon: LucideIcon;
  isActive: (state: ReturnType<typeof selectState>) => boolean;
  run: (editor: Editor) => void;
}

const ACTIONS: ToolbarAction[][] = [
  [
    {
      label: "Bold",
      icon: BoldIcon,
      isActive: (s) => s.bold,
      run: (editor) => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      icon: ItalicIcon,
      isActive: (s) => s.italic,
      run: (editor) => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Strikethrough",
      icon: StrikethroughIcon,
      isActive: (s) => s.strike,
      run: (editor) => editor.chain().focus().toggleStrike().run(),
    },
    // "Link" isn't a plain toggle command like the others here — it needs its own popover (see
    // `LinkPopover`), so it's rendered separately below rather than fitting this data-driven list.
  ],
  [
    {
      label: "Bulleted list",
      icon: ListIcon,
      isActive: (s) => s.bulletList,
      run: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      icon: ListOrderedIcon,
      isActive: (s) => s.orderedList,
      run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Task list",
      icon: ListChecksIcon,
      isActive: (s) => s.taskList,
      run: (editor) => editor.chain().focus().toggleTaskList().run(),
    },
  ],
  [
    {
      label: "Quote",
      icon: QuoteIcon,
      isActive: (s) => s.blockquote,
      run: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Inline code",
      icon: CodeIcon,
      isActive: (s) => s.code,
      run: (editor) => editor.chain().focus().toggleCode().run(),
    },
    {
      label: "Code block",
      icon: SquareCodeIcon,
      isActive: (s) => s.codeBlock,
      run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
  ],
];

function selectState(editor: Editor) {
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    strike: editor.isActive("strike"),
    link: editor.isActive("link"),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    taskList: editor.isActive("taskList"),
    blockquote: editor.isActive("blockquote"),
    code: editor.isActive("code"),
    codeBlock: editor.isActive("codeBlock"),
  };
}

/** A persistent formatting row below the editor, for users who don't already know the markdown
 * shortcuts (`**bold**`, `- `, `> `, ...) or the `/` command menu by heart — the same underlying
 * commands as both of those, just always visible. Modeled on GitHub's own comment-box toolbar
 * (the closest reference point for this exact audience) rather than inventing a fresh set:
 * deliberately excludes headings (reachable via `/`, less common in a short issue body) and image
 * insertion (already covered by the "add files" button next to this row). */
export function Toolbar({ editor, mode, onModeChange }: ToolbarProps) {
  const state = useEditorState({ editor, selector: ({ editor: e }) => selectState(e) });
  // The formatting commands all act on the live Tiptap `editor`, which isn't what's on screen (or
  // being typed into) while a plain textarea shows the raw markdown instead — disabled rather
  // than hidden, so the row doesn't visibly reflow when switching modes.
  const disabled = mode === "raw";

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-t border-border px-1 py-1">
      {ACTIONS.map((group, i) => (
        <div key={i} className="flex items-center gap-0.5">
          {i > 0 && <div className="mx-1 h-4 w-px bg-border" />}
          {group.map((action) => (
            <Tooltip key={action.label}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => action.run(editor)}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
                    action.isActive(state) && "bg-accent text-foreground",
                  )}
                >
                  <action.icon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{action.label}</TooltipContent>
            </Tooltip>
          ))}
          {i === 0 && (
            <div className={cn(disabled && "pointer-events-none opacity-40")}>
              <LinkPopover editor={editor} active={state.link} />
            </div>
          )}
        </div>
      ))}
      <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5">
        <button
          type="button"
          onClick={() => onModeChange("rich")}
          className={cn(
            "rounded-sm px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground",
            mode === "rich" && "bg-accent text-foreground",
          )}
        >
          Rich
        </button>
        <button
          type="button"
          onClick={() => onModeChange("raw")}
          className={cn(
            "rounded-sm px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground",
            mode === "raw" && "bg-accent text-foreground",
          )}
        >
          Markdown
        </button>
      </div>
    </div>
  );
}
