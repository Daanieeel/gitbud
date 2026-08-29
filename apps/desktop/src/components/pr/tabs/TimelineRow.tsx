import type { ReactNode } from "react";

interface TimelineRowProps {
  icon: ReactNode;
  showTopLine: boolean;
  showBottomLine: boolean;
  children: ReactNode;
  /** The merged event renders larger with a purple icon and a thicker separator right after it
   * (see `PRTimeline.tsx`'s merge-index logic) — everything else uses the plain small rail. */
  emphasized?: boolean;
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
 * centering the icon on the *full* stretched height would sit it visibly lower than the
 * content's own first line. The top filler is shortened by half that gap (8px) plus half the
 * icon's own height so the icon lands on the content's actual vertical center instead; the
 * exact split point doesn't otherwise matter since it's fully hidden behind the icon's opaque
 * background either way. */
export function TimelineRow({
  icon,
  showTopLine,
  showBottomLine,
  children,
  emphasized,
}: TimelineRowProps) {
  const iconBoxSize = emphasized ? "size-8" : "size-6";
  const railWidth = emphasized ? "w-8" : "w-6";
  const topFillerHeight = emphasized ? "calc(50% - 24px)" : "calc(50% - 20px)";
  return (
    <div className="flex gap-3">
      <div className={`flex shrink-0 flex-col items-center ${railWidth}`}>
        <div
          className={`w-px ${showTopLine ? "bg-border" : ""}`}
          style={{ height: topFillerHeight }}
        />
        <div
          className={`z-10 flex shrink-0 items-center justify-center rounded-full bg-accent ${iconBoxSize}`}
        >
          {icon}
        </div>
        <div className={`w-px flex-1 ${showBottomLine ? "bg-border" : ""}`} />
      </div>
      <div className="min-w-0 flex-1 pb-4">{children}</div>
    </div>
  );
}
