import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Image } from "@tiptap/extension-image";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import type { AnyExtension } from "@tiptap/core";
import { lowlight } from "./lowlight";
import { buildSlashCommands, createSlashCommandExtension } from "./slashCommand";
import { createSlashMenuRenderer } from "./SlashMenu";

export function buildExtensions(options: {
  placeholder?: string;
  onRequestImage: () => void;
}): AnyExtension[] {
  return [
    StarterKit.configure({
      // A dedicated `CodeBlockLowlight` extension replaces StarterKit's own plain `codeBlock`.
      codeBlock: false,
    }),
    Placeholder.configure({ placeholder: options.placeholder }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // CommonMark itself only ever represents an image as *inline* content (one token within a
    // paragraph, never its own block-level node) — matching that, not Tiptap's own default of
    // `false`, is what lets the markdown parser insert one at all: an `inline: false` image
    // can't be placed inside a paragraph's content, so `createAndFill` was silently dropping it.
    Image.configure({ inline: true }),
    CodeBlockLowlight.configure({ lowlight }),
    createSlashCommandExtension(
      buildSlashCommands(options.onRequestImage),
      createSlashMenuRenderer(),
    ),
  ];
}
