import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState title="That page isn't here">
        <p>
          If you followed a link to a video, it has probably left the catalog: videos drop out once they are older than
          the retention window or are removed from YouTube.
        </p>
        <p className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/" className="pill">
            Go to Home
          </Link>
          <Link href="/browse/" className="pill">
            Browse all videos
          </Link>
        </p>
      </EmptyState>
    </div>
  );
}
