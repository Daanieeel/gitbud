import type MarkdownIt from "markdown-it";

const CHECKBOX_RE = /^\[([ xX])\]\s+/;

/** A minimal, self-written GFM task-list tokenizer plugin for markdown-it — deliberately not the
 * community `markdown-it-task-lists` package, which is designed to inject raw HTML `<input>`
 * tokens for markdown-it's own HTML renderer (which this app never uses; these tokens feed
 * `prosemirror-markdown`'s `MarkdownParser` instead, which wants clean, typed tokens, not
 * embedded HTML). Retags an entire `bullet_list` span to `task_list`/`task_item` only when EVERY
 * direct-child item starts with a `[ ] `/`[x] ` marker — GFM itself allows a list to mix checkbox
 * and plain items, but Tiptap's schema doesn't (a `taskList` node can only contain `taskItem`
 * children), so a genuinely mixed list is left as a plain bullet list rather than only
 * half-converting it. */
export function taskListPlugin(md: MarkdownIt): void {
  md.core.ruler.after("inline", "task_list", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "bullet_list_open") continue;

      // Walk to this list's matching close, recording each *direct* child item's own opening
      // token and leading `inline` token (nested sub-lists are skipped via the depth check).
      let depth = 1;
      let itemDepth = 0;
      const items: { open: number; inline: number | null }[] = [];
      let j = i + 1;
      for (; j < tokens.length && depth > 0; j++) {
        const type = tokens[j].type;
        if (type === "bullet_list_open" || type === "ordered_list_open") depth++;
        else if (type === "bullet_list_close" || type === "ordered_list_close") depth--;
        else if (depth === 1 && type === "list_item_open") {
          itemDepth++;
          items.push({ open: j, inline: null });
        } else if (depth === 1 && itemDepth > 0 && type === "list_item_close") {
          itemDepth--;
        } else if (
          depth === 1 &&
          itemDepth === 1 &&
          type === "inline" &&
          items.length > 0 &&
          items[items.length - 1].inline === null
        ) {
          items[items.length - 1].inline = j;
        }
      }
      const listClose = j - 1;
      if (items.length === 0) continue;

      const checks = items.map((item) =>
        item.inline !== null ? CHECKBOX_RE.exec(tokens[item.inline].content) : null,
      );
      if (checks.some((match) => !match)) continue; // not every item has a checkbox — leave as-is

      tokens[i].type = "task_list_open";
      tokens[listClose].type = "task_list_close";
      items.forEach((item, idx) => {
        tokens[item.open].type = "task_item_open";

        // This item's matching close: track `list_item` nesting depth alone from just past its
        // own open, so a nested sub-list's item-close pairs balance out before reaching this
        // item's own.
        let d = 1;
        for (let k = item.open + 1; k < listClose; k++) {
          if (tokens[k].type === "list_item_open") d++;
          else if (tokens[k].type === "list_item_close") {
            d--;
            if (d === 0) {
              tokens[k].type = "task_item_close";
              break;
            }
          }
        }

        const match = checks[idx]!;
        tokens[item.open].attrSet("checked", match[1].toLowerCase() === "x" ? "true" : "false");
        const inlineTok = tokens[item.inline!];
        inlineTok.content = inlineTok.content.slice(match[0].length);
        // The inline token's own sub-tokenization (`children`) still has the raw "[ ] "/"[x] "
        // text as its leading `text` child — strip that too, or the marker reappears in content.
        const firstChild = inlineTok.children?.[0];
        if (firstChild?.type === "text") {
          firstChild.content = firstChild.content.slice(match[0].length);
        }
      });
    }
  });
}
