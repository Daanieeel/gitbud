import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface CheckboxGroupProps extends React.ComponentProps<typeof Checkbox> {
  children: React.ReactNode;
}

/** A Checkbox plus its label, wrapped so clicking anywhere in the group — not just the checkbox
 * square itself — toggles it. A native `<label>`'s click-delegation already handles this for
 * free (a label's "labelable" descendants include `<button>`, which is what Radix's Checkbox
 * renders as), so no manual click/toggle wiring is needed here. */
function CheckboxGroup({ className, children, ...checkboxProps }: CheckboxGroupProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2",
        checkboxProps.disabled && "cursor-not-allowed",
        className,
      )}
    >
      <Checkbox {...checkboxProps} />
      {children}
    </label>
  );
}

export { CheckboxGroup };
