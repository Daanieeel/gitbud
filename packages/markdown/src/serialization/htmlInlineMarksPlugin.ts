import type MarkdownIt from "markdown-it";

/** Recognizes literal raw-HTML tag pairs this editor can represent as a real mark it already
 * has — `<u>`/`</u>` (underline, written by `toMarkdown.ts` since GFM has no native syntax for
 * it) and `<code>`/`</code>` (some generators, e.g. GitHub Apps' auto-posted comments, use this
 * instead of backticks) — and retags them from generic `html_inline` tokens into their own
 * `_open`/`_close` pair, which `fromMarkdown.ts` then maps to the matching mark the same way it
 * maps `em`/`strong`. `<code>`/`</code>` get a distinct token name (`html_code`, not `code_inline`)
 * since `code_inline` is a single self-contained token (from backtick syntax) rather than a real
 * open/close pair, and reusing its name here would conflict with that `noCloseToken` mapping.
 * Any other raw HTML markdown-it tokenizes is left as plain `html_inline` and silently dropped
 * (see `html_inline: {ignore: true}` in `fromMarkdown.ts`) — this editor's schema has no node to
 * hold arbitrary HTML, and never renders parsed content as raw HTML, so there's no injection risk
 * in leaving `html: true` on for this. */
export function htmlInlineMarksPlugin(md: MarkdownIt): void {
  md.core.ruler.after("inline", "html-inline-marks", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "inline" || !token.children) continue;
      for (const child of token.children) {
        if (child.type !== "html_inline") continue;
        if (child.content === "<u>") child.type = "underline_open";
        else if (child.content === "</u>") child.type = "underline_close";
        else if (child.content === "<code>") child.type = "html_code_open";
        else if (child.content === "</code>") child.type = "html_code_close";
      }
    }
  });
}
