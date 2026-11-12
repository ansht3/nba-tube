"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { isSaved, toSavedVideo } from "@/lib/storage/library";
import {
  addToPlaylist,
  createPlaylist,
  newPlaylistId,
  playlistsStore,
  removeFromPlaylist,
  validatePlaylistName,
  PLAYLIST_NAME_MAX,
} from "@/lib/storage/playlists";
import { useStore } from "@/lib/storage/use-store";
import { CloseIcon, ListIcon } from "./icons";

export function AddToPlaylist({ video }: { video: { youtubeId: string; title: string; channelTitle: string } }) {
  const playlists = useStore(playlistsStore);
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();
  const errorId = useId();

  function toggle(playlistId: string, checked: boolean) {
    playlistsStore.update((current) =>
      checked
        ? addToPlaylist(current, playlistId, toSavedVideo(video, Date.now()))
        : removeFromPlaylist(current, playlistId, video.youtubeId),
    );
  }

  function createAndAdd(event: FormEvent) {
    event.preventDefault();
    const problem = validatePlaylistName(name, playlists);
    setError(problem);
    if (problem) return;

    const id = newPlaylistId();
    playlistsStore.update((current) =>
      addToPlaylist(createPlaylist(current, name, id, Date.now()), id, toSavedVideo(video, Date.now())),
    );
    setName("");
  }

  return (
    <>
      <button type="button" className="pill" onClick={() => dialog.current?.showModal()}>
        <ListIcon />
        Save to playlist
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        onClose={() => setError(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-text backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b border-line py-2 pl-5 pr-2">
          <h2 id={headingId} className="font-semibold">
            Save to playlist
          </h2>
          <button type="button" aria-label="Close" onClick={() => dialog.current?.close()} className="grid size-11 cursor-pointer place-items-center rounded-full hover:bg-surface-2">
            <CloseIcon />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-5 py-3">
          {playlists.length === 0 ? (
            <p className="py-2 text-sm text-muted">You have no playlists yet. Name one below to create it.</p>
          ) : (
            <ul>
              {playlists.map((playlist) => (
                <li key={playlist.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-5 accent-(--accent)"
                      checked={isSaved(playlist.items, video.youtubeId)}
                      onChange={(event) => toggle(playlist.id, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                    <span className="text-sm tabular-nums text-muted">{playlist.items.length}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={createAndAdd} className="border-t border-line px-5 py-4" noValidate>
          <label htmlFor={`${headingId}-name`} className="text-sm font-medium">
            New playlist
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id={`${headingId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={PLAYLIST_NAME_MAX}
              placeholder="Playlist name"
              aria-invalid={error !== null}
              aria-describedby={error ? errorId : undefined}
              className="field min-w-0 flex-1"
            />
            <button type="submit" className="pill">
              Create
            </button>
          </div>
          {error && (
            <p id={errorId} role="alert" className="mt-2 text-sm text-accent">
              {error}
            </p>
          )}
        </form>
      </dialog>
    </>
  );
}
