"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const SHORTCUTS: [key: string, action: string][] = [
  ["/", "Search"],
  ["j / k", "Next or previous video"],
  ["Enter", "Open the selected video"],
  ["l", "Like the video you are watching"],
  ["w", "Watch later (the selected video, or the one you are watching)"],
  ["h", "Home"],
  ["?", "Show these shortcuts"],
];

/** Moves focus to the next (+1) or previous (-1) video link on the page. */
function moveFocus(step: 1 | -1) {
  const links = [...document.querySelectorAll<HTMLElement>("[data-video-link]")].filter((link) => link.offsetParent !== null);
  if (links.length === 0) return;
  const current = links.indexOf(document.activeElement as HTMLElement);
  const next = current === -1 ? (step === 1 ? 0 : links.length - 1) : Math.min(links.length - 1, Math.max(0, current + step));
  links[next].focus();
  links[next].scrollIntoView({ block: "nearest" });
}

/** HackerTube's keyboard shortcuts. "/" lives with the search box in the header. */
export function KeyboardShortcuts() {
  const router = useRouter();
  const help = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (typing || event.metaKey || event.ctrlKey || event.altKey || help.current?.open) return;

      const focused = document.activeElement?.closest("[data-video-link]");
      switch (event.key) {
        case "j":
          moveFocus(1);
          break;
        case "k":
          moveFocus(-1);
          break;
        case "h":
          router.push("/");
          break;
        case "l":
          document.querySelector<HTMLElement>('[data-shortcut="like"]')?.click();
          break;
        case "w": {
          // A selected card's own button first, so "w" never saves a video other than the one in view.
          const card = focused?.parentElement?.querySelector<HTMLElement>(".thumb-action");
          (card ?? (focused ? null : document.querySelector<HTMLElement>('[data-shortcut="later"]')))?.click();
          break;
        }
        case "?":
          help.current?.showModal();
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <dialog
      ref={help}
      aria-labelledby="shortcuts-title"
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-xl border border-line bg-surface p-5 text-text backdrop:bg-black/50"
    >
      <h2 id="shortcuts-title" className="text-lg font-bold">
        Keyboard shortcuts
      </h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {SHORTCUTS.map(([key, action]) => (
          <div key={key} className="contents">
            <dt>
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{key}</kbd>
            </dt>
            <dd className="text-muted">{action}</dd>
          </div>
        ))}
      </dl>
      <form method="dialog" className="mt-5 flex justify-end">
        <button type="submit" className="pill">
          Close
        </button>
      </form>
    </dialog>
  );
}
