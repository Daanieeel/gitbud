import { Hero } from "@/components/hero";
import { getMessages } from "@/i18n/get-messages";
import { getSoftwareApplicationJsonLd } from "@/lib/json-ld";

export default function HomePage() {
  const { meta } = getMessages();
  const jsonLd = getSoftwareApplicationJsonLd(meta.description);

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Hero />
    </main>
  );
}
