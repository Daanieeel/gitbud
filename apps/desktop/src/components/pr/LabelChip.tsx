import { XIcon } from "lucide-react";

interface LabelChipProps {
  name: string;
  /** GitHub's raw label color, a 6-digit hex string with no leading `#` (e.g. "d73a4a"). */
  color?: string;
  /** When set, renders a small "x" inside the pill itself (in the label's own color, via
   * `currentColor`) instead of a separate remove affordance elsewhere — used by
   * `MultiSelectField`'s selected-chips row, which clones this element in with the toggle
   * handler rather than wrapping it in its own generic chip styling. */
  onRemove?: () => void;
}

/** GitHub-style label chip — background/border derived from the label's own color at different
 * alpha levels, rather than a fixed palette, since a repo's labels are user-defined. Text is
 * always white rather than the raw hex — using the hex itself as text color was unreadable
 * whenever a label's color happened to be dark. */
export function LabelChip({ name, color, onRemove }: LabelChipProps) {
  const hex = color ?? "6e7781";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{
        backgroundColor: `#${hex}26`,
        border: `1px solid #${hex}66`,
      }}
    >
      {name}
      {onRemove && (
        <XIcon
          className="size-3 shrink-0 opacity-70 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      )}
    </span>
  );
}
