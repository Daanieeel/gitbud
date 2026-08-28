import { describe, expect, it } from "bun:test";
import {
  abbreviateFilePath,
  candidateToText,
  generatePathCandidates,
  splitPathParts,
} from "./abbreviatePath";

describe("abbreviatePath", () => {
  describe("splitPathParts", () => {
    it("splits standard nested filepaths", () => {
      const parts = splitPathParts("apps/desktop/src/components/repo/BranchSwitcher.tsx");
      expect(parts.dirs).toEqual(["apps", "desktop", "src", "components", "repo"]);
      expect(parts.filename).toBe("BranchSwitcher.tsx");
      expect(parts.stem).toBe("BranchSwitcher");
      expect(parts.ext).toBe(".tsx");
    });

    it("handles single-level files", () => {
      const parts = splitPathParts("README.md");
      expect(parts.dirs).toEqual([]);
      expect(parts.filename).toBe("README.md");
      expect(parts.stem).toBe("README");
      expect(parts.ext).toBe(".md");
    });

    it("handles files without extension", () => {
      const parts = splitPathParts("src/Dockerfile");
      expect(parts.dirs).toEqual(["src"]);
      expect(parts.filename).toBe("Dockerfile");
      expect(parts.stem).toBe("Dockerfile");
      expect(parts.ext).toBe("");
    });

    it("handles dotfiles", () => {
      const parts = splitPathParts(".gitignore");
      expect(parts.dirs).toEqual([]);
      expect(parts.filename).toBe(".gitignore");
      expect(parts.stem).toBe(".gitignore");
      expect(parts.ext).toBe("");
    });
  });

  describe("generatePathCandidates", () => {
    it("generates candidates from full path to middle abbreviation to filename truncation", () => {
      const path = "apps/desktop/src/components/repo/BranchSwitcher.tsx";
      const candidates = generatePathCandidates(path);

      expect(candidateToText(candidates[0])).toBe(
        "apps/desktop/src/components/repo/BranchSwitcher.tsx",
      );

      const candidateTexts = candidates.map(candidateToText);
      expect(candidateTexts).toContain("apps/.../BranchSwitcher.tsx");
      expect(candidateTexts).toContain(".../BranchSwitcher.tsx");
    });
  });

  describe("abbreviateFilePath with maxChars", () => {
    it("abbreviates middle of filepath first (Example 1)", () => {
      const path = "apps/desktop/src/components/repo/BranchSwitcher.tsx";
      const result = abbreviateFilePath(path, { maxChars: 30 });
      const text = candidateToText(result);

      expect(text).toBe("apps/.../BranchSwitcher.tsx");
      expect(result).toEqual([
        { text: "apps/" },
        { text: ".../", isAbbreviation: true },
        { text: "BranchSwitcher.tsx" },
      ]);
    });

    it("abbreviates middle of filepath and truncates filename ending with ellipsis when needed (Example 2)", () => {
      const path = "apps/desktop/src/components/repo/BranchSwitcherToHelpUserNavigateExample.tsx";
      const result = abbreviateFilePath(path, { maxChars: 27 });
      const text = candidateToText(result);

      expect(text).toBe(".../BranchSwitcherTo....tsx");
      expect(result).toEqual([
        { text: ".../", isAbbreviation: true },
        { text: "BranchSwitcherTo" },
        { text: "...", isAbbreviation: true },
        { text: ".tsx" },
      ]);
    });

    it("keeps full path when it fits within length", () => {
      const path = "src/App.tsx";
      const result = abbreviateFilePath(path, { maxChars: 50 });
      expect(candidateToText(result)).toBe("src/App.tsx");
      expect(result).toEqual([{ text: "src/App.tsx" }]);
    });

    it("handles single-file paths with long names", () => {
      const path = "VeryLongSingleFileNameWithoutDirectories.tsx";
      const result = abbreviateFilePath(path, { maxChars: 20 });
      const text = candidateToText(result);

      expect(text).toBe("VeryLongSingl....tsx");
      expect(result).toEqual([
        { text: "VeryLongSingl" },
        { text: "...", isAbbreviation: true },
        { text: ".tsx" },
      ]);
    });

    it("respects prefix and suffix in character budget", () => {
      const path = "apps/desktop/src/components/repo/BranchSwitcher.tsx";
      const result = abbreviateFilePath(path, {
        maxChars: 50,
        prefix: 'Discard changes to "',
        suffix: '"?',
      });
      const text = candidateToText(result);
      const full = `Discard changes to "${text}"?`;
      expect(full.length).toBeLessThanOrEqual(50);
    });
  });
});
