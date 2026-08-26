import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export interface SliderMark {
  value: number;
  label: string;
  /** Extra detail shown on hover, falls back to `label` alone if omitted. */
  tooltip?: string;
}

// Matches the thumb's `size-4` (16px). The thumb's center can only travel between half its own
// width and (track width - half its own width), not the full 0-100% of the container, so a mark
// at the same raw percentage would drift away from the thumb toward the edges. This linearly
// interpolates between those same two bounds so a mark's position always matches where the thumb
// actually sits (and, at the far edges, where you can actually click) at that value.
const THUMB_SIZE_PX = 16;

interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  /** Labeled step positions rendered below the track, each with a hover tooltip, e.g. the
   * "Poor / Fair / Good / Excellent" ticks under a discrete-step slider. Clicking one jumps the
   * slider straight to that value. */
  marks?: SliderMark[];
}

function Slider({ className, marks, min = 0, max = 100, onValueChange, ...props }: SliderProps) {
  const thumbPosition = (value: number) => {
    const fraction = (value - min) / (max - min);
    return `calc(${THUMB_SIZE_PX / 2}px + (100% - ${THUMB_SIZE_PX}px) * ${fraction})`;
  };

  return (
    <div className={cn("w-full", className)}>
      <SliderPrimitive.Root
        data-slot="slider"
        min={min}
        max={max}
        onValueChange={onValueChange}
        className="relative flex w-full cursor-pointer touch-none items-center select-none"
        {...props}
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block size-4 shrink-0 cursor-pointer rounded-full border-2 border-primary bg-background shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
      </SliderPrimitive.Root>
      {marks && marks.length > 0 && (
        <div className="relative mt-1.5 h-4 w-full text-xs text-muted-foreground">
          {marks.map((mark) => (
            <Tooltip key={mark.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onValueChange?.([mark.value])}
                  className="absolute -translate-x-1/2 cursor-pointer hover:text-foreground first:translate-x-0 last:-translate-x-full"
                  style={{ left: thumbPosition(mark.value) }}
                >
                  {mark.label}
                </button>
              </TooltipTrigger>
              <TooltipContent>{mark.tooltip ?? mark.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

export { Slider };
