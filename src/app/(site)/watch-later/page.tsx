import type { Metadata } from "next";
import { LibraryList } from "@/components/LibraryList";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Watch later" };

export default function WatchLaterPage() {
  return (
    <>
      <PageHeader title="Watch later">
        <p>Your queue, newest first. It is stored only in this browser.</p>
      </PageHeader>
      <LibraryList list="watchLater" />
    </>
  );
}
