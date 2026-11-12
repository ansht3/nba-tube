import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { NavLinks } from "@/components/nav";
import { SettingsSync } from "@/components/SettingsSync";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { SETTINGS_BOOT_SCRIPT } from "@/lib/storage/settings";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_TAGLINE,
  // YouTube's player needs the page origin, but not the path the viewer is on.
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0e10" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script sets data attributes on <html> before React hydrates,
    // which is the mismatch suppressHydrationWarning is there to allow.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SETTINGS_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen pt-14 antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SettingsSync />
        <Header />
        <aside className="fixed bottom-0 left-0 top-14 hidden w-56 overflow-y-auto border-r border-line lg:block">
          <NavLinks />
        </aside>
        <div className="lg:pl-56">
          <main id="main" className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
