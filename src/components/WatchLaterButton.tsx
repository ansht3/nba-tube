"use client";

import { isSaved, toSavedVideo, toggleSaved, watchLaterStore } from "@/lib/storage/library";
import { useStore } from "@/lib/storage/use-store";
import { CheckIcon, ClockIcon } from "./icons";

interface Props {
  video: { youtubeId: string; title: string; channelTitle: string };
  /** "overlay" sits on a thumbnail. "pill" is the labelled button on the watch page. */
  variant: "overlay" | "pill";
}

export function WatchLaterButton({ video, variant }: Props) {
  const list = useStore(watchLaterStore);
  const saved = isSaved(list, video.youtubeId);
  const label = saved ? "Remove from Watch later" : "Save to Watch later";

  function toggle() {
    watchLaterStore.update((current) => toggleSaved(current, toSavedVideo(video, Date.now())));
  }

  if (variant === "pill") {
    return (
      <button type="button" onClick={toggle} aria-pressed={saved} className="pill">
        {saved ? <CheckIcon /> : <ClockIcon />}
        {saved ? "Saved" : "Watch later"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={`${label}: ${video.title}`}
      title={label}
      data-on={saved}
      className="thumb-action"
    >
      {saved ? <CheckIcon className="size-[18px]" /> : <ClockIcon className="size-[18px]" />}
    </button>
  );
}
