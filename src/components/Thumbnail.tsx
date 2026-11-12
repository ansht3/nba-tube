"use client";

import { useState } from "react";
import { PlayIcon } from "./icons";

/**
 * A video thumbnail from YouTube's image host, shown as YouTube made it. The
 * standard size is 4:3 with black bars, so it is cropped to 16:9 by the frame
 * around it. If the image fails to load, a neutral placeholder takes its place
 * instead of the browser's broken-image icon.
 */
export function Thumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="grid h-full w-full place-items-center text-muted">
        <PlayIcon className="size-8" />
      </div>
    );
  }

  return (
    // The title sits right next to the image, so the image itself is decorative.
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      width={480}
      height={360}
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}
