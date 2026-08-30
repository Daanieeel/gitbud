import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { getSchema } from "@tiptap/core";
import { proseClassName } from "@gitbud/ui/markdown";
import { Textarea } from "@gitbud/ui/textarea";
import { cn } from "@gitbud/ui/utils";
import { buildExtensions } from "./extensions";
import type { EditorMode } from "./Toolbar";
import { docToMarkdown } from "../serialization/toMarkdown";
import { markdownToDoc } from "../serialization/fromMarkdown";
import { BubbleFormatMenu } from "./BubbleFormatMenu";
import { Toolbar } from "./Toolbar";

export interface MarkdownEditorHandle {
  /** Uploads (or, on failure, embeds as a `data:` URI) and inserts an image at the current
   * cursor position — exposed so a "click to add files" button living outside the editor
   * itself (in the host dialog's own chrome) can trigger the same path the editor's own
   * paste/drop handling and its `/` "Image" command use internally. */
  insertImage: (file: File) => Promise<void>;
}

interface MarkdownEditorProps {
  /** The document as a plain markdown string — this is the one source of truth callers deal in
   * (it's what actually gets sent to GitHub); the ProseMirror doc underneath is purely an
   * implementation detail of the editing experience. */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** Uploads an image and returns its URL. When omitted, or when it throws, images are embedded
   * as `data:` URIs instead — an acceptable fallback, not a silent failure. */
  onUploadImage?: (file: File) => Promise<string>;
  autoFocus?: boolean;
  className?: string;
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // SAFETY: `readAsDataURL` always yields a string result on load (only `readAsArrayBuffer`/
    // `readAsBinaryString` can produce the other members of `FileReader.result`'s type).
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** A high-fidelity, WYSIWYG markdown editor (no raw syntax ever visible, no separate preview
 * mode — what's on screen already is the rendered form) built on Tiptap/ProseMirror, with our own
 * schema, slash-command menu, selection bubble menu, and persistent bottom toolbar rather than a
 * pre-styled drop-in. Controlled on a markdown *string*, not a ProseMirror doc — every consumer in
 * this app (GitHub issue/PR bodies, comments) ultimately reads and writes plain markdown. */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    { value, onChange, placeholder, onUploadImage, autoFocus, className },
    ref,
  ) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    // The markdown string this component itself last emitted via `onChange` — lets the
    // external-`value`-sync effect below tell "the parent echoed back what we just typed" apart
    // from "the parent genuinely changed `value` out from under us" (e.g. resetting the dialog),
    // without which every keystroke would round-trip through a doc-destroying re-parse.
    const lastEmitted = useRef(value);
    // `editorProps.handlePaste`/`handleDrop` (below, inside `useEditor`) need to call
    // `insertImage`, but `insertImage` itself needs the `editor` instance `useEditor` produces —
    // routed through a ref (kept current on every render, no effect needed) to break that cycle
    // without reordering `useEditor` after its own option callbacks.
    const insertImageRef = useRef<(file: File) => Promise<void>>(async () => {});
    // "Rich" shows the live WYSIWYG editor; "Raw" swaps it for a plain textarea over the exact
    // same markdown string — an escape hatch for anyone who wants to see/edit the literal
    // markdown rather than trust the WYSIWYG round-trip. Toggling back re-parses whatever was
    // typed in raw mode into the doc (see the sync effect below); while in raw mode, that same
    // effect is skipped entirely rather than re-parsing (and resetting undo history) on every
    // keystroke nobody's looking at the rendered result of yet.
    const [mode, setMode] = useState<EditorMode>("rich");

    const extensions = useMemo(
      () => buildExtensions({ placeholder, onRequestImage: () => fileInputRef.current?.click() }),
      [placeholder],
    );
    // `useEditor` needs a fully-formed initial document up front, but building one from markdown
    // requires the schema `getSchema` derives from these same extensions — computed once here
    // (lazy `useState` initializer) rather than inside `useEditor` itself, so it isn't
    // recomputed (and the doc re-parsed) on every render.
    const [initialDoc] = useState(() => markdownToDoc(value, getSchema(extensions)));

    const editor = useEditor({
      extensions,
      // `useEditor`'s `content` option only accepts HTML/JSON, not a raw ProseMirror `Node` —
      // `toJSON()` is the standard bridge between the two.
      content: initialDoc.toJSON(),
      autofocus: autoFocus ?? false,
      editorProps: {
        attributes: {
          class: cn(
            proseClassName,
            "min-h-full px-3 py-2 outline-none",
            // `Placeholder` only ever adds the `is-editor-empty` class + a `data-placeholder`
            // attribute to the empty node — it renders no visible text on its own, that's left
            // to consumer CSS (its own docs require exactly this same `::before` rule).
            "[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          ),
        },
        handlePaste: (_view, event) => {
          const images = Array.from(event.clipboardData?.files ?? []).filter((f) =>
            f.type.startsWith("image/"),
          );
          if (images.length === 0) return false;
          event.preventDefault();
          for (const file of images) void insertImageRef.current(file);
          return true;
        },
        handleDrop: (_view, event) => {
          const images = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
            f.type.startsWith("image/"),
          );
          if (images.length === 0) return false;
          event.preventDefault();
          for (const file of images) void insertImageRef.current(file);
          return true;
        },
      },
      onUpdate: ({ editor: updatedEditor }) => {
        const markdown = docToMarkdown(updatedEditor.state.doc);
        lastEmitted.current = markdown;
        onChange(markdown);
      },
    });

    const insertImage = useCallback(
      async (file: File) => {
        if (!editor) return;
        let url: string;
        try {
          url = onUploadImage ? await onUploadImage(file) : await fileToDataUri(file);
        } catch {
          url = await fileToDataUri(file);
        }
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      },
      [editor, onUploadImage],
    );
    insertImageRef.current = insertImage;

    // Sync an external `value` change (e.g. the host dialog resetting the form) into the editor —
    // skipped when `value` is just this component's own last-emitted markdown echoed back through
    // a controlled `value` prop, which would otherwise destroy the live selection/undo-history on
    // every keystroke.
    useEffect(() => {
      if (!editor || mode !== "rich" || value === lastEmitted.current) return;
      lastEmitted.current = value;
      editor.commands.setContent(markdownToDoc(value, editor.schema).toJSON());
    }, [value, editor, mode]);

    useImperativeHandle(ref, () => ({ insertImage }), [insertImage]);

    return (
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-md border border-input bg-accent transition-colors focus-within:ring-2 focus-within:ring-ring",
          className,
        )}
      >
        {mode === "rich" ? (
          <div
            className="min-h-0 flex-1 overflow-auto"
            onClick={(e) => {
              // A native `<textarea>` fills the whole clickable area, so clicking below its last
              // line still lands inside it and the browser puts the caret at the very end. This
              // contenteditable-based editor doesn't grow to fill the same space — clicking past
              // the last line (or into any other dead space around the actual editable content)
              // lands on this scroll container itself and does nothing on its own. `closest` (not
              // a direct `target === currentTarget` check) is what makes this robust regardless
              // of however many wrapper elements `EditorContent` itself renders between this div
              // and the real `.ProseMirror` editable root — a plain equality check only catches
              // the dead space when that root happens to be an immediate child, silently doing
              // nothing the moment it isn't. A click that already landed inside real editable
              // content is left alone; the browser/ProseMirror's own click handling places the
              // cursor there as normal.
              if (e.target instanceof Element && !e.target.closest(".ProseMirror")) {
                editor?.commands.focus("end");
              }
            }}
          >
            {editor && <BubbleFormatMenu editor={editor} />}
            <EditorContent editor={editor} className="h-full" />
          </div>
        ) : (
          <Textarea
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent font-mono text-xs shadow-none hover:bg-transparent focus-visible:ring-0"
          />
        )}
        {editor && <Toolbar editor={editor} mode={mode} onModeChange={setMode} />}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            for (const file of Array.from(e.target.files ?? [])) void insertImage(file);
            e.target.value = "";
          }}
        />
      </div>
    );
  },
);
