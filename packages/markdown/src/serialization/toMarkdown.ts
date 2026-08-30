import { MarkdownSerializer } from "prosemirror-markdown";
import type { Node } from "@tiptap/pm/model";

/** Mirrors `prosemirror-markdown`'s own `backticksFor` helper (used for the inline `code` mark
 * below) — picks a fence of backticks one longer than any run already inside the code span, so
 * the fence itself never gets swallowed as part of the content. */
function backticksFor(node: Node, side: number): string {
  const ticks = /`+/g;
  let match: RegExpExecArray | null;
  let len = 0;
  if (node.isText) {
    while ((match = ticks.exec(node.text ?? ""))) len = Math.max(len, match[0].length);
  }
  let result = len > 0 && side > 0 ? " `" : "`";
  for (let i = 0; i < len; i++) result += "`";
  if (len > 0 && side < 0) result += " ";
  return result;
}

/** A `MarkdownSerializer` for our editor's schema (Tiptap's StarterKit + task list/item + image),
 * modeled directly on `prosemirror-markdown`'s own `defaultMarkdownSerializer` (same library,
 * same node-serializer-function shape) rather than a from-scratch implementation — that package's
 * basic schema uses snake_case node names (`code_block`, `bullet_list`, ...) that don't match
 * Tiptap's camelCase ones, so this re-keys every entry and adds `taskList`/`taskItem`/`underline`,
 * which have no equivalent in the basic schema at all. */
export const markdownSerializer = new MarkdownSerializer(
  {
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    text(state, node) {
      // Unlike `defaultMarkdownSerializer`, links here are always the bracketed `[text](url)`
      // form (see the `link` mark below) rather than sometimes the bare `<url>` autolink form —
      // so, unlike that serializer, text content is always escaped normally with no autolink
      // special-case to track.
      state.text(node.text ?? "", true);
    },
    heading(state, node) {
      state.write(`${state.repeat("#", node.attrs.level)} `);
      state.renderInline(node, false);
      state.closeBlock(node);
    },
    blockquote(state, node) {
      state.wrapBlock("> ", null, node, () => state.renderContent(node));
    },
    horizontalRule(state, node) {
      state.write("---");
      state.closeBlock(node);
    },
    hardBreak(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write("\\\n");
          return;
        }
      }
    },
    bulletList(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    orderedList(state, node) {
      // SAFETY: `start` is `@tiptap/extension-list`'s own attr, always a number or null — never
      // set to anything else, by this editor's own extension config or the markdown parser.
      const start = (node.attrs.start as number | null) ?? 1;
      const maxWidth = String(start + node.childCount - 1).length;
      const space = state.repeat(" ", maxWidth + 2);
      state.renderList(node, space, (i) => {
        const numeral = String(start + i);
        return state.repeat(" ", maxWidth - numeral.length) + numeral + ". ";
      });
    },
    listItem(state, node) {
      state.renderContent(node);
    },
    // GFM task lists are, syntactically, just bullet lists whose items start with `[ ] `/`[x] `
    // — Tiptap models them as separate node types, so the marker is written here instead of
    // `bulletList`'s.
    taskList(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    taskItem(state, node) {
      state.write(node.attrs.checked ? "[x] " : "[ ] ");
      state.renderContent(node);
    },
    codeBlock(state, node) {
      // Make sure the fence is longer than any backtick run already inside the block's content.
      const backtickRuns = node.textContent.match(/`{3,}/gm);
      const fence = backtickRuns ? `${backtickRuns.sort().slice(-1)[0]}\`` : "```";
      // SAFETY: `language` is `@tiptap/extension-code-block`'s own attr, always a string or null.
      state.write(fence + ((node.attrs.language as string | null) || "") + "\n");
      state.text(node.textContent, false);
      state.write("\n");
      state.write(fence);
      state.closeBlock(node);
    },
    image(state, node) {
      // SAFETY: `alt`/`src`/`title` are all `@tiptap/extension-image`'s own attrs.
      const alt = state.esc((node.attrs.alt as string | null) || "");
      // SAFETY: `src` is required to construct an image node at all — always a string.
      const src = (node.attrs.src as string).replace(/[()]/g, "\\$&");
      // SAFETY: `title` is always a string or null.
      const title = node.attrs.title
        ? ` "${(node.attrs.title as string).replace(/"/g, '\\"')}"`
        : "";
      state.write(`![${alt}](${src}${title})`);
    },
  },
  {
    bold: { open: "**", close: "**", mixable: true, expelEnclosingWhitespace: true },
    italic: { open: "*", close: "*", mixable: true, expelEnclosingWhitespace: true },
    strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    // No CommonMark/GFM syntax for underline — raw HTML is the one representation every
    // GFM-compatible renderer (including GitHub's own) already tolerates inline.
    underline: { open: "<u>", close: "</u>", mixable: true },
    code: {
      open: (_state, _mark, parent, index) => backticksFor(parent.child(index), -1),
      close: (_state, _mark, parent, index) => backticksFor(parent.child(index - 1), 1),
      escape: false,
    },
    link: {
      open: "[",
      close: (_state, mark) => {
        // SAFETY: `href` is `@tiptap/extension-link`'s own attr, always a string — required to
        // create the mark at all.
        const href = (mark.attrs.href as string).replace(/[()"]/g, "\\$&");
        return `](${href})`;
      },
      mixable: true,
    },
  },
);

export function docToMarkdown(doc: Node): string {
  return markdownSerializer.serialize(doc, { tightLists: true });
}
