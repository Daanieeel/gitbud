import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, autoComplete = "off", ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      autoComplete={autoComplete}
      data-slot="textarea"
      className={cn(
        "flex w-full min-w-0 resize-none rounded-md border border-input bg-accent px-3 py-2 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
