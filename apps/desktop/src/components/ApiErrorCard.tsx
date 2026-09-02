import { TriangleAlertIcon } from "lucide-react";
import { formatApiError } from "@/lib/apiError";

/** A titled, readable card for a failed list-fetch error, in place of dumping the raw backend
 * error string (e.g. `GitHub API error 404 Not Found: {"message":"Not Found",...}`) on screen. */
export function ApiErrorCard({ message }: { message: string }) {
  const { title, description } = formatApiError(message);
  return (
    <div className="m-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
        <TriangleAlertIcon className="size-3.5 shrink-0" />
        <span>{title}</span>
      </div>
      <p className="mt-1 text-xs text-destructive/80">{description}</p>
    </div>
  );
}
