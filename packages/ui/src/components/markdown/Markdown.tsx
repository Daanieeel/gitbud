import { useEffect, useMemo, useState } from "react";
import { marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import { cn } from "../../lib/utils";
import { ensureLanguageLoaded, highlightBlock, languageForToken } from "../../lib/highlight";

interface MarkdownProps {
  content: string;
  className?: string;
}

/** Shared prose styling for rendered markdown content — exported so `@gitbud/markdown`'s live
 * WYSIWYG editor can look pixel-identical to this read-only renderer rather than maintaining a
 * second hand-tuned copy of the same selector list. */
export const proseClassName = [
  // Plain marker class (not a Tailwind utility) — hooks the hand-rolled `input[type="checkbox"]`
  // reskin in styles.css, which needs a stable selector a `::after` pseudo-element can attach to.
  "gitbud-prose",
  "max-w-none text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold",
  "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold",
  "[&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold",
  "[&_p]:mb-2 [&_p]:mt-0",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  // `border-border` isn't reliable here: in dark mode `--border` and `--accent` are the exact
  // same color, and even in light mode they're nearly identical — invisible against the
  // editor's `bg-accent` wrapper even though it reads fine on the `--card` background most
  // read-only views sit on. `border-muted-foreground` has real contrast against both.
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_hr]:my-3 [&_hr]:border-border",
  "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
  "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium",
  "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
  "[&_img]:max-w-full [&_img]:rounded-md",
  // Task-list items (GFM `- [ ] x`) and underline have no counterpart in the pre-editor renderer
  // — added here (rather than left unstyled) since the live editor shares this same class list.
  "[&_ul.task-list]:list-none [&_ul.task-list]:pl-0",
  // `items-start` (not `items-center`) — a task item can wrap onto multiple lines, and the
  // checkbox should stay pinned to the first line rather than drift toward the vertical center
  // of the whole wrapped block. The checkbox's own small top margin (`.gitbud-prose
  // input[type="checkbox"]` in styles.css) is what centers it against that first line specifically.
  "[&_li[data-checked]]:flex [&_li[data-checked]]:list-none [&_li[data-checked]]:items-start [&_li[data-checked]]:gap-2 [&_li[data-checked]]:pl-1",
  "[&_u]:underline",
].join(" ");

const renderer = new marked.Renderer();
// Every language token seen across every render, tracked module-wide (not per-component) so a
// grammar loaded for one comment's code block is already warm for the next one that uses it.
const pendingLanguages = new Set<string>();

renderer.code = ({ text, lang }) => {
  const language = languageForToken(lang);
  const highlighted = highlightBlock(text, language);
  if (language) pendingLanguages.add(language);
  const classAttr = language ? ` class="language-${language} hljs"` : "";
  return `<pre><code${classAttr}>${highlighted}</code></pre>`;
};

// marked's own `list`/`listitem` renderers emit plain `<ul>`/`<li>` with no marker at all for a
// GFM task-list item (`- [ ] x`) — no class, no `data-checked`, nothing `proseClassName`'s
// `[&_ul.task-list]`/`[&_li[data-checked]]` rules (shared with the live editor, whose Tiptap
// `taskList` node does carry those) can key off, so a task item rendered here still gets a
// plain bullet marker next to its checkbox instead of the editor's flex layout. `this.parser`
// (not available to an arrow function) is why these are regular functions, not arrows like
// `code` above.
renderer.list = function list(token: Tokens.List): string {
  const tag = token.ordered ? "ol" : "ul";
  const startAttr = token.ordered && token.start !== 1 ? ` start="${token.start}"` : "";
  const classAttr = token.items.some((item) => item.task) ? ' class="task-list"' : "";
  const body = token.items.map((item) => this.listitem(item)).join("");
  return `<${tag}${startAttr}${classAttr}>\n${body}</${tag}>\n`;
};

renderer.listitem = function listitem(item: Tokens.ListItem): string {
  const checkedAttr = item.task ? " data-checked" : "";
  return `<li${checkedAttr}>${this.parser.parse(item.tokens)}</li>\n`;
};

marked.use({ renderer });

/** Renders third-party markdown (PR descriptions, issue comments, review bodies) — the one place
 * in the app rendering untrusted HTML-adjacent content, so the parsed output always goes through
 * DOMPurify before `dangerouslySetInnerHTML`. Fenced code blocks reuse the same highlight.js
 * on-demand grammar loading `DiffView` uses: renders plain on first paint, then re-renders once
 * the block's language grammar finishes loading. */
export function Markdown({ content, className }: MarkdownProps) {
  const [, setLoadTick] = useState(0);

  const html = useMemo(() => {
    pendingLanguages.clear();
    const raw = marked.parse(content, { async: false });
    return DOMPurify.sanitize(raw);
  }, [content]);

  useEffect(() => {
    const toLoad = Array.from(pendingLanguages);
    let cancelled = false;
    for (const language of toLoad) {
      const pending = ensureLanguageLoaded(language);
      if (pending) void pending.then(() => !cancelled && setLoadTick((n) => n + 1));
    }
    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <div
      className={cn(proseClassName, className)}
      // SAFETY: `html` is always passed through DOMPurify.sanitize() above before reaching here.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
