interface ResizeHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
}

/** An invisible drag-to-resize zone between two panes, with zero layout footprint of its own
 * — the actual boundary between the panes stays wherever their own border/gap already puts
 * it, and this just widens the draggable hit-area to straddle that point symmetrically. */
export function ResizeHandle({ onPointerDown }: ResizeHandleProps) {
  return (
    <div className="relative w-0 shrink-0">
      <div
        onPointerDown={onPointerDown}
        className="absolute inset-y-0 -left-3 -right-3 z-10 cursor-col-resize"
      />
    </div>
  );
}
