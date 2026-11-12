import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line px-4 py-8 text-[13px] leading-relaxed text-muted sm:px-6">
      <p className="max-w-3xl">
        {SITE_NAME} is an independent project. It is not affiliated with, endorsed by or sponsored by the NBA, its teams,
        any broadcaster, YouTube or Google. Videos play in YouTube&apos;s own player and belong to their publishers.
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <li>
          <Link href="/about/" className="hover:text-text hover:underline">
            About
          </Link>
        </li>
        <li>
          <Link href="/privacy/" className="hover:text-text hover:underline">
            Privacy
          </Link>
        </li>
        <li>
          <a href="https://www.youtube.com/t/terms" rel="noopener noreferrer" target="_blank" className="hover:text-text hover:underline">
            YouTube Terms of Service
          </a>
        </li>
        <li>
          <a href="https://policies.google.com/privacy" rel="noopener noreferrer" target="_blank" className="hover:text-text hover:underline">
            Google Privacy Policy
          </a>
        </li>
      </ul>
    </footer>
  );
}
