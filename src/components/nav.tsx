"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ChatIcon,
  ClockIcon,
  GridIcon,
  HeartIcon,
  HistoryIcon,
  HomeIcon,
  InfoIcon,
  ListIcon,
  MicIcon,
  PlayIcon,
  SettingsIcon,
  ShieldIcon,
  WhistleIcon,
} from "./icons";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const NAV_GROUPS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [
      { href: "/", label: "Home", icon: <HomeIcon /> },
      { href: "/highlights/", label: "Highlights", icon: <PlayIcon /> },
      { href: "/pregame/", label: "Pregame", icon: <WhistleIcon /> },
      { href: "/postgame/", label: "Postgame", icon: <MicIcon /> },
      { href: "/interviews/", label: "Interviews", icon: <ChatIcon /> },
      { href: "/teams/", label: "Teams", icon: <ShieldIcon /> },
      { href: "/browse/", label: "Browse all", icon: <GridIcon /> },
    ],
  },
  {
    title: "Your library",
    items: [
      { href: "/watch-later/", label: "Watch later", icon: <ClockIcon /> },
      { href: "/liked/", label: "Liked", icon: <HeartIcon /> },
      { href: "/history/", label: "History", icon: <HistoryIcon /> },
      { href: "/playlists/", label: "Playlists", icon: <ListIcon /> },
    ],
  },
  {
    title: null,
    items: [
      { href: "/settings/", label: "Settings", icon: <SettingsIcon /> },
      { href: "/about/", label: "About", icon: <InfoIcon /> },
    ],
  },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // A team page still belongs to "Teams", and so on.
  return `${pathname.replace(/\/$/, "")}/`.startsWith(href);
}

/** The site navigation, shared by the desktop sidebar and the mobile drawer. */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-4 p-3">
      {NAV_GROUPS.map((group, index) => (
        <div key={index}>
          {group.title && (
            <p className="nav-group-title px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{group.title}</p>
          )}
          <ul>
            {group.items.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={current ? "page" : undefined}
                    className={`nav-link flex h-11 items-center gap-3 rounded-lg px-3 text-sm ${
                      current ? "bg-surface-2 font-semibold" : "hover:bg-surface-2"
                    }`}
                  >
                    <span className={current ? "text-accent" : "text-muted"}>{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
