"use client";

import { useEffect } from "react";
import { historyStore, recordWatch, toSavedVideo } from "@/lib/storage/library";
import { settingsStore } from "@/lib/storage/settings";

/** Notes that a video was opened, unless the viewer has paused history in Settings. */
export function HistoryRecorder({ youtubeId, title, channelTitle }: { youtubeId: string; title: string; channelTitle: string }) {
  useEffect(() => {
    if (!settingsStore.get().historyEnabled) return;
    historyStore.update((history) => recordWatch(history, toSavedVideo({ youtubeId, title, channelTitle }, Date.now())));
  }, [youtubeId, title, channelTitle]);

  return null;
}
