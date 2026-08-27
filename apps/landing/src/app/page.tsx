import { Hero } from "@/components/hero";
import { getMessages } from "@/i18n/get-messages";
import { siteUrl } from "@/lib/site";

export default function HomePage() {
  const { meta } = getMessages();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GitBud",
    description: meta.description,
    url: siteUrl,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Windows, Linux",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Hero />
    </main>
  );
}
