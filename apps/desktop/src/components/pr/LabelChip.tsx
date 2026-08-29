interface LabelChipProps {
  name: string;
  /** GitHub's raw label color, a 6-digit hex string with no leading `#` (e.g. "d73a4a"). */
  color?: string;
}

/** GitHub-style label chip — background/text/border all derived from the label's own color at
 * different alpha levels, rather than a fixed palette, since a repo's labels are user-defined. */
export function LabelChip({ name, color }: LabelChipProps) {
  const hex = color ?? "6e7781";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: `#${hex}26`,
        color: `#${hex}`,
        border: `1px solid #${hex}66`,
      }}
    >
      {name}
    </span>
  );
}
