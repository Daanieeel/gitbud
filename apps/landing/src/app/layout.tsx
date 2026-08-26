import type { Metadata } from "next";
import { getMessages, defaultLocale } from "@/i18n/get-messages";
import { siteUrl } from "@/lib/site";
import { NetlifyBadge } from "@/components/netlify-badge";
import "./globals.css";

const { meta } = getMessages();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: meta.title,
  description: meta.description,
  openGraph: {
    title: meta.title,
    description: meta.description,
    url: siteUrl,
    siteName: "GitBud",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: meta.title,
    description: meta.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={defaultLocale}>
      <body>
        {children}
        <NetlifyBadge />
      </body>
    </html>
  );
}
