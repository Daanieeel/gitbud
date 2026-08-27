import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { Check, Info, Scale, X } from "lucide-react";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export const metadata: Metadata = {
  title: "License · GitBud",
};

const PERMISSIONS = ["Commercial use", "Modification", "Distribution", "Patent use", "Private use"];
const LIMITATIONS = ["Liability", "Warranty"];
const CONDITIONS = [
  "License and copyright notice",
  "State changes",
  "Disclose source",
  "Network use is distribution",
  "Same license",
];

function TermList({
  title,
  items,
  icon: Icon,
  iconClassName,
}: {
  title: string;
  items: string[];
  icon: typeof Check;
  iconClassName: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm">
            <Icon className={`mt-0.5 size-4 shrink-0 ${iconClassName}`} aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LicenseSummary() {
  return (
    <div className="border-border bg-card overflow-hidden rounded-2xl border">
      <div className="p-6 sm:p-8">
        <div className="flex gap-4">
          <div className="bg-background border-border flex size-14 shrink-0 items-center justify-center rounded-xl border">
            <Scale className="text-accent-purple size-7" strokeWidth={1.75} aria-hidden />
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Daanieeel/gitbud is licensed under the</p>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              GNU Affero General Public License v3.0
            </h2>
          </div>
        </div>

        <p className="text-muted-foreground mt-4 text-justify text-sm leading-relaxed">
          Permissions of this strongest copyleft license are conditioned on making available
          complete source code of licensed works and modifications, which include larger works
          using a licensed work, under the same license. Copyright and license notices must be
          preserved. Contributors provide an express grant of patent rights. When a modified
          version is used to provide a service over a network, the complete source code of the
          modified version must be made available.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
          <TermList
            title="Permissions"
            items={PERMISSIONS}
            icon={Check}
            iconClassName="text-accent-green"
          />
          <TermList
            title="Limitations"
            items={LIMITATIONS}
            icon={X}
            iconClassName="text-destructive"
          />
          <TermList
            title="Conditions"
            items={CONDITIONS}
            icon={Info}
            iconClassName="text-accent-blue"
          />
        </div>
      </div>

      <div className="border-border text-muted-foreground border-t px-6 py-4 text-sm sm:px-8">
        This is not legal advice.{" "}
        <a
          href="https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          Learn more about repository licenses
        </a>
      </div>
    </div>
  );
}

async function getLicenseHtml(): Promise<string> {
  const licensePath = path.join(process.cwd(), "..", "..", "LICENSE");
  const source = await readFile(licensePath, "utf8");

  // The LICENSE file hard-wraps prose at ~72 columns using leading spaces for
  // centering and sub-clause indentation. Left as-is, CommonMark reads any
  // line indented 4+ spaces as an indented code block, so we strip leading
  // whitespace first and let blank lines alone define paragraph breaks.
  const dedented = source
    .split("\n")
    .map((line) => line.trimStart())
    .join("\n");

  // CommonMark reads bare "<...>" as either an autolink (only for URLs/emails) or raw
  // inline HTML, which is dropped by remark-rehype. The license's own template placeholders
  // (e.g. "<year>", "<name of author>") match the raw-HTML case and would otherwise vanish,
  // so swap out real autolinks first, escape every remaining "<"/">", then restore them.
  const autolinks: string[] = [];
  const escaped = dedented
    .replace(/<(https?:\/\/[^\s<>]+)>/g, (match) => {
      autolinks.push(match);
      return `%%AUTOLINK_${autolinks.length - 1}%%`;
    })
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/%%AUTOLINK_(\d+)%%/g, (_, index: string) => autolinks[Number(index)]);

  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(escaped);

  return String(file);
}

export default async function LicensePage() {
  const html = await getLicenseHtml();

  return (
    <main>
      <section className="mx-auto max-w-4xl px-6 pt-32 pb-24">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">License</h1>
        <p className="text-muted-foreground mt-3 text-base">
          GitBud is free software, licensed under the GNU Affero General Public License v3.0.
        </p>

        <div className="mt-10">
          <LicenseSummary />
        </div>

        <div
          className="markdown-body mt-10"
          // SAFETY: HTML is generated from our own repo's LICENSE file at build time, not user input.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </section>
    </main>
  );
}
