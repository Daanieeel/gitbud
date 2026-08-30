import { useEffect, useImperativeHandle, useState, forwardRef } from "react";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { cn } from "@gitbud/ui/utils";
import type { SlashCommandItem } from "./slashCommand";

interface SlashMenuListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface SlashMenuListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

const SlashMenuList = forwardRef<SlashMenuListHandle, SlashMenuListProps>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowDown") {
          setSelected((i) => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((i) => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "Enter") {
          if (items[selected]) command(items[selected]);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="rounded-md border border-border bg-popover p-1 shadow-md">
          <div className="p-2 text-center text-xs text-muted-foreground">No matches</div>
        </div>
      );
    }

    return (
      <div className="flex w-56 flex-col gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md">
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            onClick={() => command(item)}
            onMouseEnter={() => setSelected(i)}
            className={cn(
              "flex items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent",
              i === selected && "bg-accent",
            )}
          >
            <item.icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    );
  },
);
SlashMenuList.displayName = "SlashMenuList";

/** Builds the `render` callback `createSlashCommandExtension` passes straight to `Suggestion` —
 * mounts `SlashMenuList` via Tiptap's own `ReactRenderer` + the suggestion plugin's managed
 * `mount()` (Floating UI-backed, auto-repositions on scroll/resize), matching the standard recipe
 * for every Tiptap mention/emoji-picker example. */
export function createSlashMenuRenderer(): NonNullable<
  SuggestionOptions<SlashCommandItem, SlashCommandItem>["render"]
> {
  return () => {
    let component: ReactRenderer<SlashMenuListHandle, SlashMenuListProps> | undefined;
    let unmount: (() => void) | undefined;

    return {
      onStart: (props) => {
        component = new ReactRenderer(SlashMenuList, {
          props: { items: props.items, command: props.command },
          editor: props.editor,
        });
        // SAFETY: `ReactRenderer` always creates its own wrapper `<div>` (an `HTMLElement`) to
        // render into — `.element`'s broader `Element` type is just DOM's own supertype for it.
        unmount = props.mount(component.element as HTMLElement);
      },
      onUpdate: (props) => {
        component?.updateProps({ items: props.items, command: props.command });
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          unmount?.();
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        unmount?.();
        component?.destroy();
      },
    };
  };
}
