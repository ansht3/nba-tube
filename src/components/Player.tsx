"use client";

import { useEffect, useRef, useState } from "react";
import { embedUrl, watchUrl } from "@/lib/youtube";
import { ExternalIcon } from "./icons";

// The few parts of YouTube's IFrame Player API that this component uses.
interface YouTubeNamespace {
  Player: new (element: HTMLIFrameElement, options: { events: { onError: (event: { data: number }) => void } }) => unknown;
}
declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoading: Promise<YouTubeNamespace> | null = null;

function loadPlayerApi(): Promise<YouTubeNamespace> {
  apiLoading ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiLoading = null;
      reject(new Error("The YouTube player API could not be loaded"));
    };
    document.head.append(script);
  });
  return apiLoading;
}

// Error codes that mean the video will never play here: removed or private
// (100), embedding disabled by the owner (101, 150), and a bad id (2).
const UNPLAYABLE = new Set([2, 100, 101, 150]);

/**
 * YouTube's own embedded player, unmodified and never covered by anything.
 *
 * The iframe is part of the server-rendered HTML, so the video shows and plays
 * without waiting for this component's script. The Player API is attached
 * afterwards only to hear about errors, so that a video that was removed or
 * restricted after the last sync gets a plain explanation and a link out
 * instead of a dead frame.
 */
export function Player({ youtubeId, title }: { youtubeId: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [unplayable, setUnplayable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadPlayerApi().then(
      (api) => {
        if (cancelled || !frame.current) return;
        // Never call destroy() on this player: it deletes the iframe, which
        // React owns. The cancelled flag is enough to ignore late events.
        new api.Player(frame.current, {
          events: {
            onError: (event) => {
              if (!cancelled && UNPLAYABLE.has(event.data)) setUnplayable(true);
            },
          },
        });
      },
      // Without the API the player still works. Only the fallback below is lost.
      () => {},
    );

    return () => {
      cancelled = true;
    };
  }, [youtubeId]);

  if (unplayable) {
    return (
      <div role="alert" className="grid aspect-video place-items-center rounded-xl border border-line bg-surface p-6 text-center">
        <div>
          <p className="text-lg font-semibold">This video can&apos;t be played here</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Its publisher may have removed it, made it private or turned off embedding since the catalog was last
            updated.
          </p>
          <a href={watchUrl(youtubeId)} target="_blank" rel="noopener noreferrer" className="pill mt-4">
            <ExternalIcon />
            Try it on YouTube
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video overflow-hidden rounded-xl bg-black">
      <iframe
        ref={frame}
        src={embedUrl(youtubeId)}
        title={title}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full border-0"
      />
    </div>
  );
}
