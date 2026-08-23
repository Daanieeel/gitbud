import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import ruby from "highlight.js/lib/languages/ruby";
import php from "highlight.js/lib/languages/php";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import bash from "highlight.js/lib/languages/bash";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import sql from "highlight.js/lib/languages/sql";
import ini from "highlight.js/lib/languages/ini";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("php", php);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("ini", ini);

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  html: "xml",
  htm: "xml",
  xml: "xml",
  css: "css",
  scss: "css",
  less: "css",
  json: "json",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "java",
  rb: "ruby",
  php: "php",
  c: "cpp",
  h: "cpp",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  mdx: "markdown",
  sql: "sql",
  toml: "ini",
  ini: "ini",
  cfg: "ini",
};

export function languageForPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext ? EXT_TO_LANG[ext] : undefined;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Highlights a single line in isolation — loses cross-line grammar state (e.g. mid
 * multi-line comment/string) like most diff viewers' per-line highlighting does. */
export function highlightLine(content: string, language: string | undefined): string {
  if (!language) return escapeHtml(content);
  try {
    return hljs.highlight(content, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(content);
  }
}

/** Overlays character-offset ranges (the backend's intraline diff) onto HTML already produced
 * by `highlightLine`, wrapping the covered plain-text characters in a highlight span so syntax
 * highlighting and diff highlighting both show at once. Offsets count each HTML entity
 * (`&amp;`, `&lt;`, `&gt;`) as the one character it represents and tags as contributing no
 * characters, matching how `highlightLine`/`escapeHtml` produced the HTML.
 *
 * A highlighted range can legally start or end in the middle of an existing token `<span>` (a
 * syntax-highlight boundary and a diff-highlight boundary have no reason to line up). Naively
 * inserting our own `<span>...</span>` across such a boundary produces invalid nesting that a
 * real HTML parser resolves by stack discipline, not by "what we meant" — e.g. a literal closing
 * tag encountered while our span is still open closes *our* span (it's innermost), silently
 * dropping the highlight for everything after it in that token. To avoid depending on that, we
 * never let our span cross a tag: it's closed right before any tag and reopened right after, if
 * the highlighted range continues past it. */
export function applyHighlightRanges(html: string, ranges: [number, number][], className: string): string {
  if (ranges.length === 0) return html;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);

  let result = "";
  let textPos = 0;
  let rangeIdx = 0;
  let open = false;
  let i = 0;

  const isInRange = () => {
    while (rangeIdx < sorted.length && sorted[rangeIdx][1] <= textPos) rangeIdx++;
    return rangeIdx < sorted.length && sorted[rangeIdx][0] <= textPos && textPos < sorted[rangeIdx][1];
  };

  while (i < html.length) {
    if (html[i] === "<") {
      const close = html.indexOf(">", i);
      const end = close === -1 ? html.length : close + 1;
      if (open) {
        result += "</span>";
        open = false;
      }
      result += html.slice(i, end);
      i = end;
      if (isInRange()) {
        result += `<span class="${className}">`;
        open = true;
      }
      continue;
    }

    let charLen = 1;
    if (html[i] === "&") {
      const semi = html.indexOf(";", i);
      if (semi !== -1 && semi - i <= 6) charLen = semi - i + 1;
    }

    const inRange = isInRange();
    if (inRange && !open) {
      result += `<span class="${className}">`;
      open = true;
    } else if (!inRange && open) {
      result += "</span>";
      open = false;
    }

    result += html.slice(i, i + charLen);
    i += charLen;
    textPos += 1;
  }
  if (open) result += "</span>";
  return result;
}
