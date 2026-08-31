import { formatDistanceToNow } from "date-fns";
import Flag from "react-flagpack";
import "react-flagpack/dist/style.css";
import { GlobeIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { useSettingsStore } from "@/store/useSettingsStore";
import { formatDatePart, formatTimePart, resolveTimezone } from "@/lib/timezone";
import { countryForTimezone, flagAssetCode, localeForTimezone } from "@/lib/timezoneCountries";

interface RelativeTimeProps {
  iso: string;
  className?: string;
}

/** A relative timestamp ("1 hour ago"), underlined, with the exact date/time in a tooltip on
 * hover — used everywhere a timeline/activity timestamp is shown (the "opened this PR" line,
 * every timeline event) so none of them force the reader to do date math, while the precise
 * moment is still one hover away. The tooltip's absolute time is rendered in the user's chosen
 * time zone setting (General tab) — the relative distance itself needs no such handling, since a
 * duration since a fixed instant doesn't change with the zone it's viewed from. */
export function RelativeTime({ iso, className }: RelativeTimeProps) {
  const timezone = useSettingsStore((s) => s.settings.timezone);
  const dateFormat = useSettingsStore((s) => s.settings.date_format);
  const timeFormat = useSettingsStore((s) => s.settings.time_format);
  if (!iso) return null;
  const date = new Date(iso);
  // date-fns prefixes imprecise distances with "about " (e.g. "about 1 hour ago") — "~" reads
  // the same but stays out of the way in the tight timeline/label spots this renders in.
  const distance = formatDistanceToNow(date, { addSuffix: true }).replace(/^about /, "~");
  // `date-fns`'s `format` always reads a `Date`'s local (system) time components — it has no way
  // to render in an arbitrary zone, so the absolute tooltip goes through `Intl.DateTimeFormat`
  // instead, whose `timeZone` option supports exactly that.
  //
  // Date and time formatting are each their own setting (General tab): "european"/"american" are
  // fixed, translation-free numeric patterns (dd.MM.yyyy/24h vs MM/dd/yyyy/12h) independent of
  // the *language* the rest of the app is in; only the third "according to time zone" mode pulls
  // in the zone's own country locale — real translation (e.g. German month names) included. That
  // locale is resolved once here and threaded into whichever of the two axes actually asked for it.
  const resolvedTimezone =
    resolveTimezone(timezone) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = localeForTimezone(resolvedTimezone);
  const absolute = [
    formatDatePart(date, resolvedTimezone, dateFormat, locale),
    formatTimePart(date, resolvedTimezone, timeFormat, locale),
  ].join(", ");
  const countryCode = countryForTimezone(resolvedTimezone);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`underline decoration-dotted ${className ?? ""}`}>{distance}</span>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-1.5">
        {countryCode ? (
          <Flag code={flagAssetCode(countryCode)} size="s" hasBorder={false} />
        ) : (
          <GlobeIcon className="size-3.5 shrink-0" />
        )}
        {absolute}
      </TooltipContent>
    </Tooltip>
  );
}
