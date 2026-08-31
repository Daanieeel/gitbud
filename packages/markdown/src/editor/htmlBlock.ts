import { Node, mergeAttributes } from "@tiptap/core";
import DOMPurify from "dompurify";

/** A block-level passthrough for raw HTML this editor's schema has no real node for — GitHub App
 * comments (bots like codesmith/dependabot) commonly post `<a><picture><img></picture></a>`
 * badge buttons this way, which used to be silently dropped on parse (matching the read-only
 * `Markdown` renderer's own documented "no schema equivalent" stance for tables etc.), losing
 * them for good the next time that description/comment got edited and saved. This node instead
 * stores the original HTML verbatim and renders it sanitized via a `NodeView`, atomic and
 * unselectable-into (no `contentDOM` — ProseMirror treats it as one opaque unit, matching how an
 * `<img>` already behaves) so it's visible but not something this editor tries to let you type
 * inside, and serializes back out to the exact original markup on save (`toMarkdown.ts`). */
export const HtmlBlock = Node.create({
  name: "htmlBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      html: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-html-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-html-block": "" })];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.setAttribute("data-html-block", "");
      dom.className = "rounded-md border border-dashed border-border p-2";
      // SAFETY: sanitized through DOMPurify immediately before assignment — the one thing this
      // string could otherwise be unsafe for.
      dom.innerHTML = DOMPurify.sanitize(node.attrs.html as string);
      return { dom };
    };
  },
});
