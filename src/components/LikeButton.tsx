"use client";

import { isSaved, likedStore, toSavedVideo, toggleSaved } from "@/lib/storage/library";
import { useStore } from "@/lib/storage/use-store";
import { HeartIcon } from "./icons";

export function LikeButton({ video, variant = "pill" }: { video: { youtubeId: string; title: string; channelTitle: string }; variant?: "pill" | "overlay" }) {
  const liked = isSaved(useStore(likedStore), video.youtubeId);
  const toggle = () => likedStore.update((current) => toggleSaved(current, toSavedVideo(video, Date.now())));

  if (variant === "overlay") {
    return (
      <button type="button" onClick={toggle} aria-pressed={liked} aria-label={`Like: ${video.title}`} title={liked ? "Liked" : "Like"} data-on={liked} data-action="like" className="thumb-action">
        <HeartIcon filled={liked} className="size-[18px]" />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={liked}
      data-shortcut="like"
      onClick={toggle}
      className="pill"
    >
      <HeartIcon filled={liked} />
      Like
    </button>
  );
}
