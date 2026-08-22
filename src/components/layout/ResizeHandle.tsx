import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ResizeHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  tooltip?: boolean;
}

/** An invisible drag-to-resize zone between two panes, with zero layout footprint of its own
 * — the actual boundary between the panes stays wherever their own border/gap already puts
 * it, and this just widens the draggable hit-area to straddle that point symmetrically. */
export function ResizeHandle({ onPointerDown, tooltip = true }: ResizeHandleProps) {
  const handle = (
    <div
      onPointerDown={onPointerDown}
      className="absolute inset-y-0 -left-3 -right-3 z-10 cursor-col-resize"
    />
  );

  return (
    <div className="relative w-0 shrink-0">
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{handle}</TooltipTrigger>
          <TooltipContent>Drag to resize</TooltipContent>
        </Tooltip>
      ) : (
        handle
      )}
    </div>
  );
}
