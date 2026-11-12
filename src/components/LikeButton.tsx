"use client";

import { isSaved, likedStore, toSavedVideo, toggleSaved } from "@/lib/storage/library";
import { useStore } from "@/lib/storage/use-store";
import { HeartIcon } from "./icons";

export function LikeButton({ video }: { video: { youtubeId: string; title: string; channelTitle: string } }) {
  const liked = isSaved(useStore(likedStore), video.youtubeId);

  return (
    <button
      type="button"
      aria-pressed={liked}
      onClick={() => likedStore.update((current) => toggleSaved(current, toSavedVideo(video, Date.now())))}
      className="pill"
    >
      <HeartIcon filled={liked} />
      Like
    </button>
  );
}
