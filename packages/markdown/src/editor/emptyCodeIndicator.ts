import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Toggling "inline code" with the cursor collapsed (nothing selected, nothing typed yet) only
 * stores the mark for the *next* typed character — ProseMirror has no text node to wrap, so
 * there's nothing for CSS to style, and the toolbar button click visibly does nothing until you
 * start typing. This renders a small placeholder right at the cursor whenever the code mark is
 * active there but has no adjacent code-marked character to attach to, using an actual `<code>`
 * element so it picks up the same `[&_code]` prose styling (padding, background, radius) as real
 * inline code — no separate CSS needed. */
export const EmptyCodeIndicator = Extension.create({
  name: "emptyCodeIndicator",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("emptyCodeIndicator"),
        props: {
          decorations(state) {
            const { selection, doc, schema } = state;
            const codeMark = schema.marks.code;
            if (!codeMark || !selection.empty) return null;

            const activeMarks = state.storedMarks ?? selection.$from.marks();
            if (!codeMark.isInSet(activeMarks)) return null;

            const pos = selection.from;
            const resolved = doc.resolve(pos);
            const beforeHasCode =
              !!resolved.nodeBefore && codeMark.isInSet(resolved.nodeBefore.marks);
            const afterHasCode = !!resolved.nodeAfter && codeMark.isInSet(resolved.nodeAfter.marks);
            // Already sitting inside (or right at the edge of) real code-marked text — that
            // already renders its own `<code>` box, so adding another here would double up.
            if (beforeHasCode || afterHasCode) return null;

            const widget = document.createElement("code");
            // A zero-width space, not left truly empty — some engines give a genuinely empty
            // inline element zero width no matter its padding.
            widget.textContent = "\u200b";
            // Inline styles (not a shared class) — the `[&_code]` prose rule targets every
            // `<code>` element, real inline code included, so widening padding there would
            // inflate real code text too. This widget alone needs to read as a clearly visible
            // box with nothing inside it, so it gets its own wider padding directly.
            widget.style.paddingLeft = "0.5rem";
            widget.style.paddingRight = "0.5rem";
            return DecorationSet.create(doc, [Decoration.widget(pos, widget, { side: 0 })]);
          },
        },
      }),
    ];
  },
});
