import type { Metadata } from "next";
import { HelpCircle } from "lucide-react";
import { ComingSoon } from "@gitbud/ui/coming-soon";

export const metadata: Metadata = {
  title: "FAQ · GitBud",
};

export default function FaqPage() {
  return (
    <main>
      <ComingSoon title="FAQ" icon={HelpCircle} className="pt-24" />
    </main>
  );
}
