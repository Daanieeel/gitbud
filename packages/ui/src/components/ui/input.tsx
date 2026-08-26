import * as React from "react";

import { cn } from "../../lib/utils";

function Input({ className, type, autoComplete = "off", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      autoComplete={autoComplete}
      data-slot="input"
      className={cn(
        "flex h-8 w-full min-w-0 rounded-md border border-input bg-accent px-3 py-1 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
