import type { HLJSApi, Language, Mode } from "highlight.js";

/** highlight.js ships no HCL/Terraform grammar (checked its `lib/languages` directory directly —
 * absent, not just unregistered), and there's no maintained standalone package for it either, so
 * this is a small hand-rolled grammar covering what actually shows up in `.tf`/`.tfvars` files:
 * line/block comments, strings with `${...}` interpolation, numbers, the handful of reserved
 * words, and block-header identifiers (`resource "aws_instance" "x" {`). */
export default function hcl(hljs: HLJSApi): Language {
  const INTERPOLATION: Mode = {
    className: "subst",
    begin: /\$\{/,
    end: /\}/,
    contains: [hljs.BACKSLASH_ESCAPE, hljs.NUMBER_MODE],
  };

  const STRING: Mode = {
    className: "string",
    begin: '"',
    end: '"',
    contains: [hljs.BACKSLASH_ESCAPE, INTERPOLATION],
  };
  // `subst`'s `contains` can't reference `STRING` before it exists, so wire the cycle up after.
  INTERPOLATION.contains?.push(STRING);

  const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_-]*/;

  return {
    name: "HCL",
    aliases: ["terraform", "tf", "tfvars"],
    case_insensitive: false,
    keywords: {
      keyword:
        "resource data variable output module provider terraform locals " +
        "for_each dynamic connection provisioner backend moved import check",
      literal: "true false null",
    },
    contains: [
      hljs.HASH_COMMENT_MODE,
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      STRING,
      hljs.C_NUMBER_MODE,
      {
        // Block header: `resource "aws_instance" "x" {` — highlight the block type as a keyword
        // (via `keywords` above) and leave the quoted labels to the STRING mode.
        className: "title.function",
        begin: new RegExp(`^[ \\t]*${IDENTIFIER.source}(?=\\s+"|\\s*\\{)`),
        keywords: {
          keyword:
            "resource data variable output module provider terraform locals dynamic",
        },
      },
      {
        // Attribute assignment: `key = value` / `key = {` — highlight the key only.
        className: "attr",
        begin: new RegExp(`${IDENTIFIER.source}(?=\\s*=[^=])`),
      },
      { className: "meta", begin: /[?:]/ },
    ],
  };
}
