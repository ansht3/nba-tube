"use client";

import { useRef, useState } from "react";
import { createBackup, mergeLibrary, readBackupFile, type Library } from "@/lib/storage/backup";
import { historyStore, likedStore, watchLaterStore } from "@/lib/storage/library";
import { playlistsStore } from "@/lib/storage/playlists";
import { DownloadIcon, UploadIcon } from "./icons";

const current = (): Library => ({ liked: likedStore.get(), watchLater: watchLaterStore.get(), history: historyStore.get(), playlists: playlistsStore.get() });

/**
 * Moves likes, watch later and playlists between browsers as a file, with no
 * account and nothing sent anywhere. Importing only adds to what is here.
 */
export function LibraryBackup() {
  const picker = useRef<HTMLInputElement>(null);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function exportLibrary() {
    const backup = createBackup(current(), { includeHistory, now: new Date() });
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `nbatube-library-${backup.exportedAt.slice(0, 10)}.json` });
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: "ok", text: "Saved your library as a file." });
  }

  async function importLibrary(file: File | undefined) {
    if (!file) return;
    const result = await readBackupFile(file);
    if (picker.current) picker.current.value = "";
    if (!result.ok) return setMessage({ kind: "error", text: result.error });

    const { library, added } = mergeLibrary(current(), result.library);
    likedStore.set(library.liked);
    watchLaterStore.set(library.watchLater);
    historyStore.set(library.history);
    playlistsStore.set(library.playlists);

    const parts = [
      added.liked && `${added.liked} liked`,
      added.watchLater && `${added.watchLater} for watch later`,
      added.history && `${added.history} in history`,
      added.playlists && `${added.playlists} playlist${added.playlists === 1 ? "" : "s"}`,
      added.playlistVideos && `${added.playlistVideos} playlist video${added.playlistVideos === 1 ? "" : "s"}`,
    ].filter(Boolean);
    const skipped = result.dropped > 0 ? ` ${result.dropped} entr${result.dropped === 1 ? "y was" : "ies were"} not valid and skipped.` : "";
    setMessage({ kind: "ok", text: `${parts.length > 0 ? `Added ${parts.join(", ")}.` : "Nothing new: everything in the file was already here."}${skipped}` });
  }

  return (
    <div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={includeHistory} onChange={() => setIncludeHistory((on) => !on)} className="size-5 accent-(--accent)" />
        Include my watch history in the file
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="pill" onClick={exportLibrary}>
          <DownloadIcon />
          Export library
        </button>
        <button type="button" className="pill" onClick={() => picker.current?.click()}>
          <UploadIcon />
          Import library
        </button>
        <input ref={picker} type="file" accept="application/json,.json" aria-label="Choose a library file to import" className="sr-only" onChange={(event) => void importLibrary(event.target.files?.[0])} />
      </div>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mt-3 text-sm ${message.kind === "error" ? "text-accent" : "text-muted"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
