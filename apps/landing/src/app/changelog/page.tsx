import type { Metadata } from "next";
import { History } from "lucide-react";
import { ComingSoon } from "@gitbud/ui/coming-soon";

export const metadata: Metadata = {
  title: "Changelog · GitBud",
};

export default function ChangelogPage() {
  return (
    <main>
      <ComingSoon title="Changelog" icon={History} className="pt-24" />
    </main>
  );
}
