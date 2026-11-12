"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useState, type FormEvent } from "react";
import { pluralize } from "@/lib/format";
import { playlistPath } from "@/lib/paths";
import {
  PLAYLIST_NAME_MAX,
  createPlaylist,
  deletePlaylist,
  newPlaylistId,
  playlistsStore,
  removeFromPlaylist,
  renamePlaylist,
  validatePlaylistName,
  type Playlist,
} from "@/lib/storage/playlists";
import { useStore } from "@/lib/storage/use-store";
import { useCatalog } from "@/lib/use-catalog";
import { playAllUrl } from "@/lib/youtube";
import { EmptyState } from "./EmptyState";
import { ExternalIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { SavedRow } from "./SavedRow";
import { StorageNotice } from "./StorageNotice";

function NameForm({
  initialName,
  playlists,
  exceptId,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  playlists: Playlist[];
  exceptId?: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validatePlaylistName(name, playlists, exceptId);
    setError(problem);
    if (problem) return;
    onSubmit(name);
    setName("");
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-xl">
      <label htmlFor={inputId} className="text-sm font-medium">
        {exceptId ? "Playlist name" : "New playlist"}
      </label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          id={inputId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={PLAYLIST_NAME_MAX}
          placeholder="Playlist name"
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          autoFocus={exceptId !== undefined}
          className="field min-w-0 flex-1 basis-48"
        />
        <button type="submit" className="pill">
          {!exceptId && <PlusIcon />}
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="pill" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-accent">
          {error}
        </p>
      )}
    </form>
  );
}

function PlaylistIndex({ playlists }: { playlists: Playlist[] }) {
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  return (
    <>
      <NameForm
        initialName=""
        playlists={playlists}
        submitLabel="Create"
        onSubmit={(name) => playlistsStore.update((current) => createPlaylist(current, name, newPlaylistId(), Date.now()))}
      />

      {playlists.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="No playlists yet">
            <p>Name one above, or use “Save to playlist” on any video&apos;s page.</p>
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-8 max-w-3xl divide-y divide-line border-y border-line">
          {playlists.map((playlist) => (
            <li key={playlist.id} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-1">
              <Link href={playlistPath(playlist.id)} className="min-w-0 flex-1 rounded-md py-2 hover:underline">
                <span className="block truncate font-medium">{playlist.name}</span>
                <span className="text-sm text-muted">{pluralize(playlist.items.length, "video")}</span>
              </Link>
              {confirmingDelete === playlist.id ? (
                <div className="flex items-center gap-2 text-sm" role="group" aria-label={`Delete ${playlist.name}`}>
                  <span>Delete it?</span>
                  <button type="button" className="pill" onClick={() => playlistsStore.update((current) => deletePlaylist(current, playlist.id))}>
                    Yes, delete
                  </button>
                  <button type="button" className="pill" autoFocus onClick={() => setConfirmingDelete(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" aria-label={`Delete playlist ${playlist.name}`} title="Delete playlist" onClick={() => setConfirmingDelete(playlist.id)} className="grid size-11 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text">
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PlaylistDetail({ playlist, playlists }: { playlist: Playlist; playlists: Playlist[] }) {
  const [renaming, setRenaming] = useState(false);
  const catalog = useCatalog(playlist.items.length > 0);
  const known = catalog.status === "ready" ? new Set(catalog.videos.map((video) => video.youtubeId)) : null;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/playlists/" className="text-muted hover:text-text hover:underline">
          Playlists
        </Link>
      </p>

      {renaming ? (
        <div className="mb-6">
          <NameForm
            initialName={playlist.name}
            playlists={playlists}
            exceptId={playlist.id}
            submitLabel="Save name"
            onCancel={() => setRenaming(false)}
            onSubmit={(name) => {
              playlistsStore.update((current) => renamePlaylist(current, playlist.id, name));
              setRenaming(false);
            }}
          />
        </div>
      ) : (
        <header className="mb-6">
          <h1 tabIndex={-1} className="break-words text-2xl font-bold tracking-tight">
            {playlist.name}
          </h1>
          <p className="mt-1 text-sm text-muted">{pluralize(playlist.items.length, "video")}, in the order you added them.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="pill" onClick={() => setRenaming(true)}>
              <PencilIcon />
              Rename
            </button>
            {playlist.items.length > 0 && (
              <a href={playAllUrl(playlist.items.map((item) => item.id))} target="_blank" rel="noopener noreferrer" className="pill">
                <ExternalIcon />
                Play all on YouTube
              </a>
            )}
          </div>
        </header>
      )}

      {playlist.items.length === 0 ? (
        <EmptyState title="This playlist is empty">
          <p>Open a video and choose “Save to playlist” to add it here.</p>
        </EmptyState>
      ) : (
        <ol className="flex max-w-3xl flex-col gap-4">
          {playlist.items.map((item, index) => (
            <SavedRow
              key={item.id}
              saved={item}
              inCatalog={known ? known.has(item.id) : true}
              removeLabel="Remove from playlist"
              onRemove={() => {
                playlistsStore.update((current) => removeFromPlaylist(current, playlist.id, item.id));
                document.querySelector<HTMLElement>("main h1")?.focus();
              }}
              lead={<span className="w-6 shrink-0 pt-1 text-right text-sm tabular-nums text-muted max-sm:hidden">{index + 1}</span>}
            />
          ))}
        </ol>
      )}
    </>
  );
}

function PlaylistsContent() {
  const playlists = useStore(playlistsStore);
  const router = useRouter();
  const listId = useSearchParams().get("list");
  const selected = listId ? playlists.find((playlist) => playlist.id === listId) : undefined;

  if (listId && selected) {
    // Keyed by id so that the rename form never carries over to another playlist.
    return <PlaylistDetail key={selected.id} playlist={selected} playlists={playlists} />;
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Playlists</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Your own lists of videos. They are stored only in this browser.</p>
      </header>
      <StorageNotice store={playlistsStore} />
      {listId && (
        <div role="status" className="mb-6 max-w-3xl rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          That playlist does not exist in this browser. It may have been deleted, or the link came from another device.{" "}
          <button type="button" className="link cursor-pointer" onClick={() => router.replace("/playlists/")}>
            Dismiss
          </button>
        </div>
      )}
      <PlaylistIndex playlists={playlists} />
    </>
  );
}

export function PlaylistsView() {
  return (
    <Suspense fallback={<h1 className="text-2xl font-bold tracking-tight">Playlists</h1>}>
      <PlaylistsContent />
    </Suspense>
  );
}
