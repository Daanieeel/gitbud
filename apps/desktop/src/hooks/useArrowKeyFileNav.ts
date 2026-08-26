import { useCallback } from "react";

/**
 * Up/Down cycles through `paths`, selecting the previous/next one. Meant to be wired to a
 * focusable file-list container's onKeyDown (not window) so that with more than one file
 * explorer mounted at once (e.g. the Changes tab behind an open stash detail dialog), the keys
 * only affect whichever one currently has focus.
 */
export function useArrowKeyFileNav(
  paths: string[],
  selectedPath: string | null,
  onSelect: (path: string) => void,
) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      if (paths.length === 0) return;

      e.preventDefault();
      const index = selectedPath ? paths.indexOf(selectedPath) : -1;
      const nextIndex =
        index === -1
          ? 0
          : e.key === "ArrowDown"
            ? Math.min(index + 1, paths.length - 1)
            : Math.max(index - 1, 0);
      onSelect(paths[nextIndex]);
    },
    [paths, selectedPath, onSelect],
  );
}
