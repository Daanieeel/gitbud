import type { ReactNode } from "react";

interface TimelineRowProps {
  icon: ReactNode;
  showTopLine: boolean;
  showBottomLine: boolean;
  children: ReactNode;
  /** The merged/terminal-closed event renders larger with a colored icon and a thicker
   * separator right after it (see `PRTimeline.tsx`'s terminal-index logic) — everything else
   * uses the plain small rail. */
  emphasized?: boolean;
  /** Overrides the icon circle's own background — used to give the terminal "closed" row a
   * destructive-tinted circle instead of the plain neutral one every other row (merged
   * included, which only tints the icon glyph, not its background) uses. */
  iconBgClassName?: string;
}

/** The shared left rail every timeline row uses — a vertical connecting line that runs behind
 * each row's icon (an opaque `bg-accent` circle sits in front of it so the line visibly stops
 * right before the icon and picks back up right after, rather than running straight through
 * it). The rail is a normal flex column (top filler / icon / bottom filler) rather than
 * absolutely-positioned segments, so it stretches to the row's actual height — including
 * variable-height card content below the icon — and lines up seamlessly with the next row's
 * rail instead of being confined to the icon's own small box. `showTopLine`/`showBottomLine`
 * are computed per-row by `PRTimeline` rather than derived from "is this the first/last row"
 * here, since the line also has to stop early at the merged event (see `PRTimeline.tsx`).
 *
 * The row's stretched height includes the fixed 16px `pb-4` gap down to the next row, but the
 * content itself only fills the top portion of that height (the gap is trailing blank space) —
 * centering the icon on the *full* stretched height (equal-height top/bottom fillers) would sit
 * it visibly lower than the content's own first line by half that gap (8px). Correcting for this
 * with a *shorter top filler* instead of a margin doesn't generalize: an emphasized row's 32px
 * icon is taller than its ~24px single-line content, so the filler would need to go negative to
 * compensate — CSS clamps a negative height to 0 instead, silently reintroducing the same
 * misalignment (verified against a live measurement: icon 4px low for the emphasized case, only
 * 2px for the plain case — small enough there to look "close enough," not there). A negative
 * `margin-top` on the icon itself has no such floor, so it's applied there instead: the equal
 * fillers put the icon dead center on the *full* stretched height, then the margin nudges it up
 * by exactly the constant 8px regardless of icon or content size. The split point between the
 * two fillers doesn't otherwise matter since it's fully hidden behind the icon's opaque
 * background either way. */
export function TimelineRow({
  icon,
  showTopLine,
  showBottomLine,
  children,
  emphasized,
  iconBgClassName,
}: TimelineRowProps) {
  const iconBoxSize = emphasized ? "size-8" : "size-6";
  const railWidth = emphasized ? "w-8" : "w-6";
  return (
    <div className="flex gap-3">
      <div className={`flex shrink-0 flex-col items-center ${railWidth}`}>
        <div className={`w-px flex-1 ${showTopLine ? "bg-border" : ""}`} />
        <div
          className={`z-10 -mt-2 mb-2 flex shrink-0 items-center justify-center rounded-full ${iconBgClassName ?? "bg-accent"} ${iconBoxSize}`}
        >
          {icon}
        </div>
        <div className={`w-px flex-1 ${showBottomLine ? "bg-border" : ""}`} />
      </div>
      <div className="min-w-0 flex-1 pb-4">{children}</div>
    </div>
  );
}
