import { formatDistanceToNow, format } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";

interface RelativeTimeProps {
  iso: string;
  className?: string;
}

/** A relative timestamp ("1 hour ago"), underlined, with the exact date/time in a tooltip on
 * hover — used everywhere a timeline/activity timestamp is shown (the "opened this PR" line,
 * every timeline event) so none of them force the reader to do date math, while the precise
 * moment is still one hover away. */
export function RelativeTime({ iso, className }: RelativeTimeProps) {
  if (!iso) return null;
  const date = new Date(iso);
  // date-fns prefixes imprecise distances with "about " (e.g. "about 1 hour ago") — "~" reads
  // the same but stays out of the way in the tight timeline/label spots this renders in.
  const distance = formatDistanceToNow(date, { addSuffix: true }).replace(/^about /, "~");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`underline decoration-dotted ${className ?? ""}`}>{distance}</span>
      </TooltipTrigger>
      <TooltipContent>{format(date, "PPp")}</TooltipContent>
    </Tooltip>
  );
}
