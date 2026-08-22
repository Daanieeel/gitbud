import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  className?: string;
}

/** A thin drag-to-resize divider between a fixed panel and the rest of the layout. */
export function ResizeHandle({ onPointerDown, className }: ResizeHandleProps) {
  return (
    <div
      onPointerDown={onPointerDown}
      title="Drag to resize"
      className={cn("group relative w-1 shrink-0 cursor-col-resize", className)}
    >
      <div className="absolute inset-y-0 left-0 w-px bg-border group-hover:bg-primary group-active:bg-primary" />
    </div>
  );
}
