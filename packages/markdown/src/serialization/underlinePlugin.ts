import type MarkdownIt from "markdown-it";

/** Recognizes literal `<u>`/`</u>` raw-HTML pairs — this editor's only representation for
 * underline, written by `toMarkdown.ts` since GFM has no native syntax for it — and retags them
 * from generic `html_inline` tokens into `underline_open`/`underline_close`, which `fromMarkdown.ts`
 * then maps to the `underline` mark the same way it maps `em`/`strong`. Any other raw HTML
 * markdown-it tokenizes is left as plain `html_inline` and silently dropped (see `html_inline:
 * {ignore: true}` in `fromMarkdown.ts`) — this editor's schema has no node to hold arbitrary HTML,
 * and never renders parsed content as raw HTML, so there's no injection risk in leaving `html:
 * true` on for this. */
export function underlinePlugin(md: MarkdownIt): void {
  md.core.ruler.after("inline", "underline", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "inline" || !token.children) continue;
      for (const child of token.children) {
        if (child.type !== "html_inline") continue;
        if (child.content === "<u>") child.type = "underline_open";
        else if (child.content === "</u>") child.type = "underline_close";
      }
    }
  });
}
