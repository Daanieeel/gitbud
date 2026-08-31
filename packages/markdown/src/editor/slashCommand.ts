import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import type { Editor, Range } from "@tiptap/core";
import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  SquareCodeIcon,
  type LucideIcon,
} from "lucide-react";

export interface SlashCommandItem {
  key: string;
  label: string;
  icon: LucideIcon;
  keywords: string;
  run: (editor: Editor, range: Range) => void;
}

/** The block types offered by the `/` menu — every command here is also reachable by typing its
 * own markdown shortcut directly (StarterKit's built-in input rules already do that for
 * headings/lists/quote/code-block/divider), so this exists purely for discoverability, matching
 * the plan's "users who don't know markdown by heart" goal. */
export function buildSlashCommands(onRequestImage: () => void): SlashCommandItem[] {
  return [
    {
      key: "text",
      label: "Text",
      icon: PilcrowIcon,
      keywords: "paragraph text",
      run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      key: "heading1",
      label: "Heading 1",
      icon: Heading1Icon,
      keywords: "heading h1 title",
      run: (editor, range) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
    },
    {
      key: "heading2",
      label: "Heading 2",
      icon: Heading2Icon,
      keywords: "heading h2 subtitle",
      run: (editor, range) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
    },
    {
      key: "heading3",
      label: "Heading 3",
      icon: Heading3Icon,
      keywords: "heading h3",
      run: (editor, range) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
    },
    {
      key: "bulletList",
      label: "Bulleted list",
      icon: ListIcon,
      keywords: "bullet list ul unordered",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      key: "orderedList",
      label: "Numbered list",
      icon: ListOrderedIcon,
      keywords: "numbered list ol ordered",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      key: "taskList",
      label: "Task list",
      icon: ListChecksIcon,
      keywords: "task todo checkbox checklist",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      key: "quote",
      label: "Quote",
      icon: QuoteIcon,
      keywords: "quote blockquote",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      key: "codeBlock",
      label: "Code block",
      icon: SquareCodeIcon,
      keywords: "code block fence snippet",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      key: "divider",
      label: "Divider",
      icon: MinusIcon,
      keywords: "divider horizontal rule hr",
      run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      key: "image",
      label: "Image",
      icon: ImageIcon,
      keywords: "image picture photo upload",
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).run();
        onRequestImage();
      },
    },
  ];
}

/** A minimal `/` command menu, built directly on `@tiptap/suggestion` (the same primitive
 * mention/emoji pickers are built on in every Tiptap example) rather than a heavier pre-built
 * slash-menu package — the actual UI (`SlashMenuList`) is a small, from-scratch component styled
 * to match this app's own dropdown-list components, not a bundled/pre-themed one. */
export function createSlashCommandExtension(
  items: SlashCommandItem[],
  render: SuggestionOptions<SlashCommandItem, SlashCommandItem>["render"],
) {
  return Extension.create({
    name: "slashCommand",
    addOptions() {
      return {
        suggestion: {
          char: "/",
          startOfLine: false,
          items: ({ query }: { query: string }) =>
            items.filter((item) => item.keywords.includes(query.toLowerCase())).slice(0, 10),
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: Range;
            props: SlashCommandItem;
          }) => props.run(editor, range),
          render,
        } satisfies Partial<SuggestionOptions<SlashCommandItem, SlashCommandItem>>,
      };
    },
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}
