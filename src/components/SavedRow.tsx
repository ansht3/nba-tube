import Link from "next/link";
import type { ReactNode } from "react";
import { watchPath } from "@/lib/paths";
import { defaultThumbnail, watchUrl } from "@/lib/youtube";
import type { SavedVideo } from "@/lib/storage/library";
import { ExternalIcon, TrashIcon } from "./icons";
import { Thumbnail } from "./Thumbnail";

interface Props {
  saved: SavedVideo;
  /** False once the catalog has loaded and does not contain this video any more. */
  inCatalog: boolean;
  /** Small line under the channel, such as "Watched Nov 10". */
  note?: string;
  removeLabel: string;
  onRemove: () => void;
  /** Extra leading content, such as a position number in a playlist. */
  lead?: ReactNode;
}

/**
 * One entry of a personal list. It is drawn from the copy saved in the
 * browser, so it still makes sense when the video has left the catalog: the
 * row then links to YouTube and says so, instead of leading to a 404.
 */
export function SavedRow({ saved, inCatalog, note, removeLabel, onRemove, lead }: Props) {
  const body = (
    <>
      <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:w-44">
        <Thumbnail src={defaultThumbnail(saved.id)} />
      </div>
      <div className="min-w-0 py-0.5">
        <h3 className="line-clamp-2 text-[15px] font-medium leading-snug group-hover:underline">{saved.title}</h3>
        <p className="mt-1 text-[13px] text-muted">{saved.channelTitle}</p>
        {note && <p className="text-[13px] text-muted">{note}</p>}
        {!inCatalog && (
          <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
            <ExternalIcon className="size-3.5" />
            No longer in the catalog. Opens on YouTube.
          </p>
        )}
      </div>
    </>
  );

  return (
    <li className="flex items-start gap-2">
      {lead}
      {inCatalog ? (
        <Link href={watchPath(saved.id)} className="group flex min-w-0 flex-1 gap-3 rounded-lg">
          {body}
        </Link>
      ) : (
        <a href={watchUrl(saved.id)} target="_blank" rel="noopener noreferrer" className="group flex min-w-0 flex-1 gap-3 rounded-lg">
          {body}
        </a>
      )}
      <button type="button" onClick={onRemove} aria-label={`${removeLabel}: ${saved.title}`} title={removeLabel} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text">
        <TrashIcon />
      </button>
    </li>
  );
}
