import MarkdownIt from "markdown-it";
import { MarkdownParser } from "prosemirror-markdown";
import type { Node, Schema } from "@tiptap/pm/model";
import { taskListPlugin } from "./taskListPlugin";
import { underlinePlugin } from "./underlinePlugin";

/** GitHub renders issue/PR bodies GFM-flavored, not strict CommonMark — markdown-it's own
 * "default" preset (tables, strikethrough, autolinking) is the closer match, unlike
 * `prosemirror-markdown`'s own `defaultMarkdownParser`, which deliberately uses the stricter
 * "commonmark" preset (whose fixed inline-rule whitelist excludes strikethrough entirely). `html:
 * true` is required for `<u>`/`</u>` to tokenize as `html_inline` at all (the rule bails out
 * immediately otherwise) — see `underlinePlugin`'s doc comment for why that's safe here. `linkify:
 * true` recognizes bare URLs already present in existing content (e.g. editing an issue body
 * someone wrote before this editor existed) as real `link` marks rather than plain text — they
 * still serialize back out through the bracketed `[url](url)` form (see `toMarkdown.ts`), not
 * reproduced as a bare autolink, which is a normalization, not a fidelity loss. */
const tokenizer = MarkdownIt("default", { html: true, linkify: true })
  .use(taskListPlugin)
  .use(underlinePlugin);

function listIsTight(tokens: readonly { type: string; hidden: boolean }[], i: number): boolean {
  while (++i < tokens.length) {
    if (tokens[i].type !== "list_item_open") return tokens[i].hidden;
  }
  return false;
}

/** A `MarkdownParser` for our editor's schema, modeled on `prosemirror-markdown`'s own
 * `defaultMarkdownParser` (same token-spec shape) — re-keyed for Tiptap's camelCase node/mark
 * names and extended with `taskList`/`taskItem` (fed by `taskListPlugin`'s retagged tokens) and
 * `underline` (GFM has no native syntax for it, so `<u>`/`</u>` are parsed via `html_inline`
 * pass-through instead of a dedicated markdown-it token). */
export function createMarkdownParser(schema: Schema): MarkdownParser {
  return new MarkdownParser(schema, tokenizer, {
    blockquote: { block: "blockquote" },
    paragraph: { block: "paragraph" },
    list_item: { block: "listItem" },
    task_item: {
      block: "taskItem",
      getAttrs: (tok) => ({ checked: tok.attrGet("checked") === "true" }),
    },
    bullet_list: {
      block: "bulletList",
      getAttrs: (_tok, tokens, i) => ({ tight: listIsTight(tokens, i) }),
    },
    task_list: {
      block: "taskList",
      getAttrs: (_tok, tokens, i) => ({ tight: listIsTight(tokens, i) }),
    },
    ordered_list: {
      block: "orderedList",
      getAttrs: (tok, tokens, i) => ({
        start: +(tok.attrGet("start") ?? 1) || 1,
        tight: listIsTight(tokens, i),
      }),
    },
    heading: { block: "heading", getAttrs: (tok) => ({ level: +tok.tag.slice(1) }) },
    code_block: { block: "codeBlock", noCloseToken: true },
    fence: {
      block: "codeBlock",
      getAttrs: (tok) => ({ language: tok.info || null }),
      noCloseToken: true,
    },
    hr: { node: "horizontalRule" },
    image: {
      node: "image",
      getAttrs: (tok) => ({
        src: tok.attrGet("src"),
        title: tok.attrGet("title") || null,
        alt: (tok.children?.[0] && tok.children[0].content) || null,
      }),
    },
    hardbreak: { node: "hardBreak" },
    // GFM tables have no equivalent node in this editor's schema (no table-editing UI is in
    // scope). Every table-related token is ignored rather than left unhandled (which would
    // throw) — the practical effect is the whole table is silently dropped (its cells' bare
    // inline content isn't valid directly inside `doc`, which only accepts block nodes, so
    // schema validation drops it during node construction) rather than the parse crashing.
    // Pasting a table is a rare enough case in an issue body that this is an acceptable v1
    // limitation, not something worth a real degradation path for.
    table: { ignore: true },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { ignore: true },
    th: { ignore: true },
    td: { ignore: true },
    // Unlike the table tokens above, `html_block` is a single self-contained token (like
    // `code_block`/`fence`), not an `_open`/`_close` pair — needs `noCloseToken` too, or the
    // factory registers handlers for `html_block_open`/`_close`, which markdown-it never emits,
    // leaving the actual `html_block` token type unhandled and the parse throws.
    html_block: { ignore: true, noCloseToken: true },

    em: { mark: "italic" },
    strong: { mark: "bold" },
    s: { mark: "strike" },
    link: { mark: "link", getAttrs: (tok) => ({ href: tok.attrGet("href") }) },
    code_inline: { mark: "code", noCloseToken: true },
    // `underlinePlugin` retags a literal `<u>`/`</u>` pair's tokens to this type; any other raw
    // HTML markdown-it tokenizes stays plain `html_inline` and is ignored (dropped) below.
    underline: { mark: "underline" },
    html_inline: { ignore: true },
  });
}

export function markdownToDoc(markdown: string, schema: Schema): Node {
  return createMarkdownParser(schema).parse(markdown);
}
