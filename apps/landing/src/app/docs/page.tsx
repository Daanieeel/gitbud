import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { ComingSoon } from "@gitbud/ui/coming-soon";

export const metadata: Metadata = {
  title: "Docs · GitBud",
};

export default function DocsPage() {
  return (
    <main>
      <ComingSoon title="Docs" icon={BookOpen} className="pt-24" />
    </main>
  );
}
