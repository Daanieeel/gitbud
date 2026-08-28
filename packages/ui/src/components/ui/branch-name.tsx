import * as React from "react";
import { cn } from "../../lib/utils";

export interface BranchNameProps extends React.ComponentProps<"code"> {
  children?: React.ReactNode;
}

export function BranchName({ className, children, onWheel, ...props }: BranchNameProps) {
  return (
    <code
      data-slot="branch-name"
      onWheel={(e) => {
        onWheel?.(e);
        if (!e.defaultPrevented && e.deltaX === 0 && e.deltaY !== 0) {
          e.currentTarget.scrollLeft += e.deltaY;
        }
      }}
      className={cn(
        "inline-flex h-7 w-fit min-w-0 max-w-full shrink items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-md border border-border bg-muted/60 px-2 font-mono text-sm whitespace-nowrap text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </code>
  );
}
