import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { ComingSoon } from "@gitbud/ui/coming-soon";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Features · GitBud",
  alternates: {
    canonical: `${siteUrl}/features/`,
  },
};

export default function FeaturesPage() {
  return (
    <main>
      <ComingSoon title="Features" icon={Sparkles} className="pt-24" />
    </main>
  );
}
