import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article className="max-w-2xl text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_p]:mt-3">
      <h1 className="text-2xl font-bold tracking-tight">Privacy and terms</h1>

      <h2>What {SITE_NAME} stores</h2>
      <p>
        Nothing on a server. There are no accounts, cookies set by {SITE_NAME}, or analytics. Your likes, watch later
        list, history, playlists and settings are kept in your browser&apos;s local storage and never leave your
        device. Clearing your browser data removes them.
      </p>

      <h2>YouTube</h2>
      <p>
        {SITE_NAME} uses YouTube API Services to find videos and plays them in YouTube&apos;s embedded player, served from
        YouTube&apos;s privacy-enhanced domain. When you play a video, YouTube and Google may collect data under their own
        policies. By using {SITE_NAME} you agree to be bound by the{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="link">
          YouTube Terms of Service
        </a>
        . Google&apos;s handling of data is described in the{" "}
        <a href="http://www.google.com/policies/privacy" target="_blank" rel="noopener noreferrer" className="link">
          Google Privacy Policy
        </a>
        .
      </p>

      <h2>Thumbnails</h2>
      <p>Video thumbnails load directly from YouTube&apos;s image servers, which receive your IP address like any website you visit.</p>
    </article>
  );
}
