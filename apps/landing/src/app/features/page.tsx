import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { ComingSoon } from "@gitbud/ui/coming-soon";

export const metadata: Metadata = {
  title: "Features · GitBud",
};

export default function FeaturesPage() {
  return (
    <main>
      <ComingSoon title="Features" icon={Sparkles} className="pt-24" />
    </main>
  );
}
