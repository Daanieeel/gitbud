import * as React from "react";
import { cn } from "../../lib/utils";

export interface ProgressCircleProps extends React.SVGProps<SVGSVGElement> {
  value: number;
  size?: number;
  strokeWidth?: number;
}

export function ProgressCircle({
  value,
  size = 14,
  strokeWidth = 2,
  className,
  ...props
}: ProgressCircleProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      className={cn("shrink-0 -rotate-90 text-muted-foreground/30", className)}
      {...props}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary transition-all duration-300"
      />
    </svg>
  );
}
