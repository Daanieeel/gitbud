export interface PathSegment {
  text: string;
  isAbbreviation?: boolean;
}

export interface PathParts {
  dirs: string[];
  filename: string;
  stem: string;
  ext: string;
}

export interface AbbreviateOptions {
  /** Maximum pixel width available for the full string (including prefix/suffix). */
  maxWidth?: number;
  /** Font string to use for canvas text measurement (e.g. '600 18px sans-serif'). */
  font?: string;
  /** Maximum character length (used as fallback when canvas/DOM measurement is not available). */
  maxChars?: number;
  /** Text prefix preceding the path (e.g. 'Discard changes to "'). */
  prefix?: string;
  /** Text suffix following the path (e.g. '"?'). */
  suffix?: string;
}

export function splitPathParts(path: string): PathParts {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    return { dirs: [], filename: "", stem: "", ext: "" };
  }
  const filename = parts[parts.length - 1];
  const dirs = parts.slice(0, parts.length - 1);

  const lastDot = filename.lastIndexOf(".");
  const hasExtension = lastDot > 0;
  const stem = hasExtension ? filename.slice(0, lastDot) : filename;
  const ext = hasExtension ? filename.slice(lastDot) : "";

  return { dirs, filename, stem, ext };
}

export function generatePathCandidates(path: string): PathSegment[][] {
  const { dirs, filename, stem, ext } = splitPathParts(path);
  if (!filename) {
    return [[{ text: path }]];
  }

  const candidates: PathSegment[][] = [];

  // 1. Full path
  if (dirs.length === 0) {
    candidates.push([{ text: filename }]);
  } else {
    candidates.push([{ text: `${dirs.join("/")}/${filename}` }]);

    // 2. Shrink middle directories: generate combinations of (k start dirs, m end dirs)
    const combinations: Array<{ k: number; m: number }> = [];
    for (let total = dirs.length - 1; total >= 1; total--) {
      for (let k = total; k >= 0; k--) {
        const m = total - k;
        if (k < dirs.length && m < dirs.length && k + m < dirs.length) {
          combinations.push({ k, m });
        }
      }
    }

    // Sort combinations:
    // 1. Total retained dirs descending (handled by outer loop)
    // 2. Prefer keeping at least 1 at start
    // 3. Prefer balanced (smaller difference between k and m)
    // 4. Prefer k >= m
    combinations.sort((a, b) => {
      const totalA = a.k + a.m;
      const totalB = b.k + b.m;
      if (totalA !== totalB) return totalB - totalA;
      if (a.k > 0 && b.k === 0) return -1;
      if (b.k > 0 && a.k === 0) return 1;
      const diffA = Math.abs(a.k - a.m);
      const diffB = Math.abs(b.k - b.m);
      if (diffA !== diffB) return diffA - diffB;
      return b.k - a.k;
    });

    for (const { k, m } of combinations) {
      const segs: PathSegment[] = [];
      if (k > 0) {
        segs.push({ text: `${dirs.slice(0, k).join("/")}/` });
      }
      segs.push({ text: ".../", isAbbreviation: true });
      if (m > 0) {
        segs.push({ text: `${dirs.slice(dirs.length - m).join("/")}/` });
      }
      segs.push({ text: filename });
      candidates.push(segs);
    }

    // 3. All directories collapsed to just ".../"
    candidates.push([{ text: ".../", isAbbreviation: true }, { text: filename }]);
  }

  // 4. Filename truncation (when directories are fully collapsed or non-existent)
  const hasDirs = dirs.length > 0;
  for (let len = stem.length - 1; len >= 1; len--) {
    const segs: PathSegment[] = [];
    if (hasDirs) {
      segs.push({ text: ".../", isAbbreviation: true });
    }
    segs.push({ text: stem.slice(0, len) });
    segs.push({ text: "...", isAbbreviation: true });
    if (ext) {
      segs.push({ text: ext });
    }
    candidates.push(segs);
  }

  return candidates;
}

let measurementCanvas: HTMLCanvasElement | null = null;

export function measureTextWidth(text: string, font: string): number {
  if (!measurementCanvas) {
    measurementCanvas = document.createElement("canvas");
  }
  const ctx = measurementCanvas.getContext("2d");
  if (!ctx) {
    return text.length * 10;
  }
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function candidateToText(segments: PathSegment[]): string {
  return segments.map((s) => s.text).join("");
}

export function abbreviateFilePath(path: string, options: AbbreviateOptions = {}): PathSegment[] {
  const candidates = generatePathCandidates(path);
  if (candidates.length === 0) {
    return [{ text: path }];
  }

  const prefix = options.prefix ?? "";
  const suffix = options.suffix ?? "";

  if (options.maxWidth != null && options.maxWidth > 0) {
    const font = options.font ?? "600 18px system-ui, -apple-system, sans-serif";
    for (const candidate of candidates) {
      const fullText = `${prefix}${candidateToText(candidate)}${suffix}`;
      const width = measureTextWidth(fullText, font);
      if (width <= options.maxWidth) {
        return candidate;
      }
    }
    return candidates[candidates.length - 1];
  }

  if (options.maxChars != null && options.maxChars > 0) {
    for (const candidate of candidates) {
      const fullLength = prefix.length + candidateToText(candidate).length + suffix.length;
      if (fullLength <= options.maxChars) {
        return candidate;
      }
    }
    return candidates[candidates.length - 1];
  }

  return candidates[0];
}
