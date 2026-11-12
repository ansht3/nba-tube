import type { Metadata, Viewport } from "next";
import { Header } from "@/components/Header";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { NewVideosNotice } from "@/components/NewVideosNotice";
import { loadCatalog } from "@/catalog/load";
import { SettingsSync } from "@/components/SettingsSync";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { SETTINGS_BOOT_SCRIPT } from "@/lib/storage/settings";
import { SIDEBAR_BOOT_SCRIPT } from "@/lib/storage/sidebar";
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
  // The newest upload this build contains. Anything later in the live catalog is new to the viewer.
  const newestAt = loadCatalog().videos.reduce<string | null>((newest, video) => (!newest || video.publishedAt > newest ? video.publishedAt : newest), null);

  return (
    // The boot scripts set data attributes on <html> before React hydrates,
    // which is the mismatch suppressHydrationWarning is there to allow.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: [SETTINGS_BOOT_SCRIPT, SIDEBAR_BOOT_SCRIPT].join(";") }} />
      </head>
      <body className="min-h-screen pt-14 antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SettingsSync />
        <Header />
        <KeyboardShortcuts />
        <NewVideosNotice newestAt={newestAt} />
        {children}
      </body>
    </html>
  );
}
