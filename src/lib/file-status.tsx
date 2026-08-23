import { ArrowLeftRightIcon, CircleIcon, FileMinusIcon, FilePenIcon, FilePlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type FileStatusKind = "created" | "modified" | "deleted" | "moved" | "other";

// Every file explorer in the app sources its per-file status from a different vocabulary:
// the working-tree ChangeKind (snake_case), git2's Delta Debug format (used for
// commit/stash/branch-diff file lists, since those are all tree-to-tree diffs under the
// hood), and GitHub's PR file status strings. Normalizing them all to one small set of kinds
// here means every explorer can share one status icon instead of five divergent color maps.
const STATUS_KIND_MAP: Record<string, FileStatusKind> = {
  // ChangeKind (changes tab)
  added: "created",
  untracked: "created",
  modified: "modified",
  deleted: "deleted",
  renamed: "moved",
  type_change: "other",
  conflicted: "other",
  // git2 Delta Debug format (history/stash/branch-diff file lists)
  Added: "created",
  Untracked: "created",
  Copied: "moved",
  Modified: "modified",
  Deleted: "deleted",
  Renamed: "moved",
  Typechange: "other",
  Conflicted: "other",
  // GitHub PR file status
  changed: "modified",
  removed: "deleted",
  copied: "moved",
  unchanged: "other",
};

export function fileStatusKind(status: string): FileStatusKind {
  return STATUS_KIND_MAP[status] ?? "other";
}

const KIND_ICON: Record<FileStatusKind, typeof FilePlusIcon> = {
  created: FilePlusIcon,
  modified: FilePenIcon,
  deleted: FileMinusIcon,
  moved: ArrowLeftRightIcon,
  other: CircleIcon,
};

const KIND_COLOR: Record<FileStatusKind, string> = {
  created: "text-accent-green",
  modified: "text-accent-yellow",
  deleted: "text-accent-pink",
  moved: "text-accent-blue",
  other: "text-muted-foreground",
};

interface FileStatusIconProps {
  status: string;
  className?: string;
}

/** A per-file status icon (created/modified/deleted/moved), colored consistently across every
 * file explorer in the app. Meant to sit at the far right of a file row, after the (possibly
 * truncated) file name, rather than as a dot overlaid on the file-type icon. */
export function FileStatusIcon({ status, className }: FileStatusIconProps) {
  const kind = fileStatusKind(status);
  const Icon = KIND_ICON[kind];
  return <Icon className={cn("shrink-0", KIND_COLOR[kind], className)} />;
}
