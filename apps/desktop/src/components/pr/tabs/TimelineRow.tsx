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
 * here, since the line also has to stop early at the merged event (see `PRTimeline.tsx`). */
export function TimelineRow({
  icon,
  showTopLine,
  showBottomLine,
  children,
  emphasized,
}: TimelineRowProps) {
  const iconBoxSize = emphasized ? "size-8" : "size-6";
  const railWidth = emphasized ? "w-8" : "w-6";
  return (
    <div className="flex gap-3">
      <div className={`flex shrink-0 flex-col items-center ${railWidth}`}>
        <div className={`w-px flex-1 ${showTopLine ? "bg-border" : ""}`} />
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
