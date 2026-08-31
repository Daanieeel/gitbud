import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { LinkIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { Input } from "@gitbud/ui/input";
import { Button } from "@gitbud/ui/button";
import { cn } from "@gitbud/ui/utils";

interface LinkPopoverProps {
  editor: Editor;
  active: boolean;
  /** "icon" (default) is the compact toolbar-row button; "row" is a full-width icon+label row,
   * for when this is shown inside `Toolbar`'s overflow popover instead of the toolbar itself. */
  variant?: "icon" | "row";
}

/** The toolbar/bubble-menu "Link" action — a proper popover (separate link-text and URL fields)
 * rather than `window.prompt`: Tauri's WebView (WKWebView on macOS) doesn't implement `prompt` at
 * all, it's a silent no-op with no visible dialog, which is exactly why a `window.prompt`-based
 * version "didn't work." Handles both adding a brand-new link (nothing selected — the typed text
 * is inserted fresh at the cursor) and editing text that's already selected or already a link. */
export function LinkPopover({ editor, active, variant = "icon" }: LinkPopoverProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");

  const openPopover = () => {
    // Expands the selection to the link's whole extent first, if the cursor merely sits inside
    // one (rather than already spanning it) — so editing an existing link replaces all of it,
    // not just whatever was selected/collapsed at the moment the popover opened.
    if (editor.isActive("link")) editor.chain().extendMarkRange("link").run();
    const { from, to, empty } = editor.state.selection;
    const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, " ");
    // SAFETY: `href` is `@tiptap/extension-link`'s own attr — always a string when the mark is
    // active at all, `undefined` (via `getAttributes` returning `{}`) otherwise.
    const existingHref = editor.getAttributes("link").href as string | undefined;
    setText(selectedText);
    setUrl(existingHref ?? "");
    setOpen(true);
  };

  const apply = () => {
    const href = url.trim();
    if (!href) {
      setOpen(false);
      return;
    }
    const label = text.trim() || href;
    const { from, to } = editor.state.selection;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from, to },
        { type: "text", text: label, marks: [{ type: "link", attrs: { href } }] },
      )
      .run();
    setOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "row" ? (
          <button
            type="button"
            onClick={openPopover}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-sm text-foreground hover:bg-accent",
              active && "bg-accent/50 font-medium",
            )}
          >
            <LinkIcon className="size-3.5 shrink-0" />
            Link
          </button>
        ) : (
          <button
            type="button"
            title="Link"
            onClick={openPopover}
            className={cn(
              "flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
              active && "bg-accent text-foreground",
            )}
          >
            <LinkIcon className="size-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-64 flex-col gap-2 p-2">
        <Input
          autoFocus
          placeholder="Text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-7 text-xs"
          onKeyDown={(e) => e.key === "Enter" && apply()}
        />
        <Input
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-7 text-xs"
          onKeyDown={(e) => e.key === "Enter" && apply()}
        />
        <div className="flex justify-end gap-2">
          {active && (
            <Button size="sm" variant="ghost" onClick={removeLink}>
              Remove
            </Button>
          )}
          <Button size="sm" onClick={apply} disabled={!url.trim()}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
