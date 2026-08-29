import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@gitbud/ui/radio-group";
import { REVIEW_OPTIONS, type ReviewEvent } from "./reviewOptions";

interface ReviewVerdictPickerProps {
  value: ReviewEvent;
  onChange: (value: ReviewEvent) => void;
  /** The PR author can't approve/request-changes on their own PR (GitHub rejects it outright) —
   * those two options render disabled with GitHub's own explanatory copy instead of being
   * hidden, matching GitHub's real "Finish your review" panel. */
  isOwnPr: boolean;
}

export function ReviewVerdictPicker({ value, onChange, isOwnPr }: ReviewVerdictPickerProps) {
  const idPrefix = useId();
  return (
    <RadioGroup
      value={value}
      // SAFETY: every RadioGroupItem below is rendered with a `value` from REVIEW_OPTIONS, whose
      // `value` field is itself typed as ReviewEvent — Radix can only ever report one of those.
      onValueChange={(v) => onChange(v as ReviewEvent)}
    >
      {REVIEW_OPTIONS.map((option) => {
        const disabled = option.value !== "COMMENT" && isOwnPr;
        const id = `${idPrefix}-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={`flex items-start gap-2 text-xs ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
          >
            <RadioGroupItem id={id} value={option.value} disabled={disabled} className="mt-0.5" />
            <span className={disabled ? "text-muted-foreground" : ""}>
              <span className="block font-medium">{option.label}</span>
              <span className="text-muted-foreground">
                {disabled ? option.disabledDescription : option.description}
              </span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
