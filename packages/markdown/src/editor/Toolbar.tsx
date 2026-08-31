import { useLayoutEffect, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  BoldIcon,
  CodeIcon,
  EllipsisIcon,
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
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { cn } from "@gitbud/ui/utils";
import { LinkPopover } from "./LinkPopover";

export type EditorMode = "rich" | "raw";

interface ToolbarProps {
  editor: Editor;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
}

interface ToolbarActionItem {
  kind: "action";
  key: string;
  label: string;
  icon: LucideIcon;
  isActive: (state: ReturnType<typeof selectState>) => boolean;
  run: (editor: Editor) => void;
}
interface ToolbarLinkItem {
  kind: "link";
  key: "link";
}
type ToolbarItem = ToolbarActionItem | ToolbarLinkItem;

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

// Flattened into one ordered list (rather than the three visually-grouped-with-dividers arrays
// this used to be) so responsive collapsing has a single, simple "first N fit, the rest go in
// the overflow popover" rule to apply — see `Toolbar`'s own doc comment. Group dividers are
// still drawn when nothing has collapsed (the common case, plenty of width); they'd otherwise
// force awkward special-casing for "a divider whose entire group just got hidden".
const ITEMS: ToolbarItem[] = [
  {
    kind: "action",
    key: "bold",
    label: "Bold",
    icon: BoldIcon,
    isActive: (s) => s.bold,
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    kind: "action",
    key: "italic",
    label: "Italic",
    icon: ItalicIcon,
    isActive: (s) => s.italic,
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    kind: "action",
    key: "strike",
    label: "Strikethrough",
    icon: StrikethroughIcon,
    isActive: (s) => s.strike,
    run: (editor) => editor.chain().focus().toggleStrike().run(),
  },
  { kind: "link", key: "link" },
  {
    kind: "action",
    key: "bulletList",
    label: "Bulleted list",
    icon: ListIcon,
    isActive: (s) => s.bulletList,
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    kind: "action",
    key: "orderedList",
    label: "Numbered list",
    icon: ListOrderedIcon,
    isActive: (s) => s.orderedList,
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    kind: "action",
    key: "taskList",
    label: "Task list",
    icon: ListChecksIcon,
    isActive: (s) => s.taskList,
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    kind: "action",
    key: "blockquote",
    label: "Quote",
    icon: QuoteIcon,
    isActive: (s) => s.blockquote,
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    kind: "action",
    key: "code",
    label: "Inline code",
    icon: CodeIcon,
    isActive: (s) => s.code,
    run: (editor) => editor.chain().focus().toggleCode().run(),
  },
  {
    kind: "action",
    key: "codeBlock",
    label: "Code block",
    icon: SquareCodeIcon,
    isActive: (s) => s.codeBlock,
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
];

// Item index -> which divider-grouped visual row it belongs to, for the "everything fits, draw
// dividers as before" rendering path — mirrors the old ACTIONS grouping (bold/italic/strike+link,
// the three list types, quote/code/code-block).
const GROUP_OF: number[] = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2];

interface ItemProps {
  item: ToolbarItem;
  editor: Editor;
  state: ReturnType<typeof selectState>;
  disabled: boolean;
}

/** Compact icon-only rendering — the always-visible row, and (off-screen) the measurement copy
 * that determines how many of these actually fit. */
function CompactItem({ item, editor, state, disabled }: ItemProps) {
  if (item.kind === "link") {
    return (
      <div className={cn(disabled && "pointer-events-none opacity-40")}>
        <LinkPopover editor={editor} active={state.link} />
      </div>
    );
  }
  const active = item.isActive(state);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={() => item.run(editor)}
          className={cn(
            "flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
            active && "bg-accent text-foreground",
          )}
        >
          <item.icon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{item.label}</TooltipContent>
    </Tooltip>
  );
}

/** Icon+label row rendering — used inside the overflow popover, where there's no space
 * constraint pushing toward an icon-only button. */
function ExpandedItem({ item, editor, state, disabled }: ItemProps) {
  if (item.kind === "link") {
    return <LinkPopover editor={editor} active={state.link} variant="row" />;
  }
  const active = item.isActive(state);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => item.run(editor)}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-sm text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent/50 font-medium",
      )}
    >
      <item.icon className="size-3.5 shrink-0" />
      {item.label}
    </button>
  );
}

const GAP_PX = 2; // `gap-0.5`

/** A persistent formatting row below the editor, for users who don't already know the markdown
 * shortcuts (`**bold**`, `- `, `> `, ...) or the `/` command menu by heart — the same underlying
 * commands as both of those, just always visible. Modeled on GitHub's own comment-box toolbar
 * (the closest reference point for this exact audience) rather than inventing a fresh set:
 * deliberately excludes headings (reachable via `/`, less common in a short issue body) and image
 * insertion (already covered by the "add files" button next to this row).
 *
 * Narrow enough (a small window, a docked panel) and these ten buttons plus the Rich/Markdown
 * toggle don't all fit on one row — rather than silently overflowing/clipping, an off-screen
 * measurement copy of every item (real DOM widths, not guessed constants) determines how many
 * fit, and the rest collapse behind a "…" button that opens a popover listing them with labels. */
export function Toolbar({ editor, mode, onModeChange }: ToolbarProps) {
  const state = useEditorState({ editor, selector: ({ editor: e }) => selectState(e) });
  const disabled = mode === "raw";

  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overflowButtonRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(ITEMS.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const recompute = () => {
      // `container` is a `flex-1` sibling of the Rich/Markdown toggle group, not its ancestor —
      // its own `clientWidth` already excludes that group's width (flex shrinks it to whatever
      // space remains), so nothing further needs subtracting for it here.
      const available = container.clientWidth;
      const overflowWidth = (overflowButtonRef.current?.offsetWidth ?? 0) + GAP_PX;

      let used = 0;
      let count = 0;
      for (let i = 0; i < ITEMS.length; i++) {
        const width = itemRefs.current[i]?.offsetWidth ?? 0;
        const next = used + width + (i > 0 ? GAP_PX : 0);
        // No overflow button needed once every remaining item is already accounted for.
        const reserve = i === ITEMS.length - 1 ? 0 : overflowWidth;
        if (next + reserve > available) break;
        used = next;
        count = i + 1;
      }
      setVisibleCount(count);
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const collapsed = visibleCount < ITEMS.length;
  const visibleItems = ITEMS.slice(0, visibleCount);
  const overflowItems = ITEMS.slice(visibleCount);

  return (
    <div className="flex shrink-0 items-center border-t border-border px-1 py-1">
      <div
        ref={containerRef}
        className="relative flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden"
      >
        {/* Off-screen measurement copy — same markup as the real row so its widths are the
            actual rendered ones, not guessed. `visibility: hidden` (not `display: none`, which
            would report zero widths) keeps it out of the visible flow via absolute positioning
            instead. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center gap-0.5"
          style={{ visibility: "hidden" }}
        >
          {ITEMS.map((item, i) => (
            <div
              key={item.key}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
            >
              <CompactItem item={item} editor={editor} state={state} disabled={disabled} />
            </div>
          ))}
          <div ref={overflowButtonRef} className="flex size-6 items-center justify-center">
            <EllipsisIcon className="size-3.5" />
          </div>
        </div>

        {collapsed
          ? visibleItems.map((item) => (
              <CompactItem
                key={item.key}
                item={item}
                editor={editor}
                state={state}
                disabled={disabled}
              />
            ))
          : // Nothing has collapsed — render with the original visual grouping/dividers.
            [0, 1, 2].map((group) => (
              <div key={group} className="flex items-center gap-0.5">
                {group > 0 && <div className="mx-1 h-4 w-px bg-border" />}
                {ITEMS.filter((_, i) => GROUP_OF[i] === group).map((item) => (
                  <CompactItem
                    key={item.key}
                    item={item}
                    editor={editor}
                    state={state}
                    disabled={disabled}
                  />
                ))}
              </div>
            ))}

        {overflowItems.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <EllipsisIcon className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="flex w-48 flex-col gap-0.5 p-1">
              {overflowItems.map((item) => (
                <ExpandedItem
                  key={item.key}
                  item={item}
                  editor={editor}
                  state={state}
                  disabled={disabled}
                />
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="ml-1 flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5">
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
