import type { Metadata } from "next";
import { History } from "lucide-react";
import { ComingSoon } from "@gitbud/ui/coming-soon";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Changelog · GitBud",
  alternates: {
    canonical: `${siteUrl}/changelog/`,
  },
};

export default function ChangelogPage() {
  return (
    <main>
      <ComingSoon title="Changelog" icon={History} className="pt-24" />
    </main>
  );
}
