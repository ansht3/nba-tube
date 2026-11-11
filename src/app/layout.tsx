import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NBATube",
  description:
    "Official NBA highlights and press conferences from league and team channels. No algorithm, no comments, no account.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
