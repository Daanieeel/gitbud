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
 * each row's icon (an opaque `bg-background` circle sits in front of the line so it visibly
 * stops right before the icon and picks back up right after, rather than running straight
 * through it). `showTopLine`/`showBottomLine` are computed per-row by `PRTimeline` rather than
 * derived from "is this the first/last row" here, since the line also has to stop early at the
 * merged event (see `PRTimeline.tsx`). */
export function TimelineRow({
  icon,
  showTopLine,
  showBottomLine,
  children,
  emphasized,
}: TimelineRowProps) {
  const iconBoxSize = emphasized ? "size-8" : "size-6";
  return (
    <div className="flex gap-3">
      <div className={`relative flex shrink-0 flex-col items-center ${iconBoxSize}`}>
        {showTopLine && (
          <div className="absolute top-0 left-1/2 h-1/2 w-px -translate-x-1/2 bg-border" />
        )}
        {showBottomLine && (
          <div className="absolute bottom-0 left-1/2 h-1/2 w-px -translate-x-1/2 bg-border" />
        )}
        <div
          className={`z-10 flex items-center justify-center rounded-full bg-background ${iconBoxSize}`}
        >
          {icon}
        </div>
      </div>
      <div className="min-w-0 flex-1 pb-4">{children}</div>
    </div>
  );
}
