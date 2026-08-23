import { cn } from "@/lib/utils";

interface AvatarProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
}

/** A user's avatar image, sourced from whichever host (GitHub today; GitLab/Bitbucket to
 * follow) already gave us an avatar URL alongside their profile. Renders nothing if none was
 * available, so callers don't need their own presence check. */
export function Avatar({ src, alt, className }: AvatarProps) {
  if (!src) return null;
  return <img src={src} alt={alt} className={cn("shrink-0 rounded-full", className)} />;
}
