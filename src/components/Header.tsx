"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, type FormEvent } from "react";
import { SITE_NAME } from "@/lib/site";
import { settingsStore } from "@/lib/storage/settings";
import { CloseIcon, MenuIcon, MoonIcon, SearchIcon, SunIcon } from "./icons";
import { NavLinks } from "./nav";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md text-lg font-bold tracking-tight" aria-label={`${SITE_NAME} home`}>
      <svg viewBox="0 0 24 24" className="size-6 text-accent" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path d="M2 12h20M12 2v20M5 5c3 3 3 11 0 14M19 5c-3 3-3 11 0 14" fill="none" stroke="var(--bg)" strokeWidth="1.3" />
      </svg>
      <span>{SITE_NAME}</span>
    </Link>
  );
}

function SearchForm({ initialQuery, currentParams }: { initialQuery: string; currentParams: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  // "/" jumps to search from anywhere, unless the viewer is already typing somewhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.key !== "/" || typing || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    // Searching from the browse page keeps the filters that are already set.
    const params = new URLSearchParams(currentParams);
    if (query) params.set("q", query);
    else params.delete("q");
    const suffix = params.toString();
    router.push(suffix ? `/browse/?${suffix}` : "/browse/");
    input.current?.blur();
  }

  return (
    <form role="search" onSubmit={onSubmit} className="flex min-w-0 flex-1 justify-center">
      <div className="relative w-full max-w-xl">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
        <input
          ref={input}
          // Remount when the URL's query changes, so Back and "Clear filters" update the box.
          key={initialQuery}
          defaultValue={initialQuery}
          type="search"
          name="q"
          maxLength={100}
          placeholder="Search videos, teams, players"
          aria-label="Search videos"
          autoComplete="off"
          className="h-10 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-[15px] placeholder:text-muted"
        />
      </div>
    </form>
  );
}

/** Reads the URL, which a statically exported page can only do inside a Suspense boundary. */
function SearchFromUrl() {
  const onBrowse = usePathname().startsWith("/browse");
  const params = useSearchParams();
  return <SearchForm initialQuery={onBrowse ? (params.get("q") ?? "") : ""} currentParams={onBrowse ? params.toString() : ""} />;
}

function ThemeToggle() {
  function toggle() {
    const dark = document.documentElement.dataset.theme === "dark";
    settingsStore.update((settings) => ({ ...settings, theme: dark ? "light" : "dark" }));
  }

  return (
    <button type="button" onClick={toggle} aria-label="Switch between light and dark theme" title="Switch theme" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-surface-2">
      {/* Both icons are rendered and CSS picks one, so the server does not need to know the theme. */}
      <MoonIcon className="size-5 dark:hidden" />
      <SunIcon className="hidden size-5 dark:block" />
    </button>
  );
}

function MobileMenu() {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} aria-label="Open menu" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-surface-2 lg:hidden">
        <MenuIcon />
      </button>
      {/* A native modal dialog traps focus, closes on Escape and returns focus to the button. */}
      <dialog
        ref={dialog}
        className="drawer"
        aria-label="Menu"
        onClick={(event) => {
          // A click on the dialog element itself is a click on the backdrop.
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="flex h-14 items-center justify-between border-b border-line pl-4 pr-2">
          <Brand />
          <button type="button" onClick={close} aria-label="Close menu" className="grid size-11 cursor-pointer place-items-center rounded-full hover:bg-surface-2">
            <CloseIcon />
          </button>
        </div>
        <NavLinks onNavigate={close} />
      </dialog>
    </>
  );
}

export function Header() {
  return (
    // Fixed, like the sidebar beside it, so the two never move relative to each other.
    <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg px-2 sm:gap-4 sm:px-4">
      <MobileMenu />
      <div className="shrink-0 max-sm:hidden lg:w-52">
        <Brand />
      </div>
      <Suspense fallback={<SearchForm initialQuery="" currentParams="" />}>
        <SearchFromUrl />
      </Suspense>
      <ThemeToggle />
    </header>
  );
}
