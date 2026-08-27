import type { Metadata } from "next";
import { getMessages, defaultLocale } from "@/i18n/get-messages";
import { siteUrl } from "@/lib/site";
import { Nav } from "@/components/nav";
import { NetlifyBadge } from "@/components/netlify-badge";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const { meta } = getMessages();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: meta.title,
  description: meta.description,
  alternates: {
    canonical: siteUrl,
  },
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
    <html lang={defaultLocale} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Nav />
          {children}
          <NetlifyBadge />
        </ThemeProvider>
      </body>
    </html>
  );
}
