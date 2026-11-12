import type { Metadata } from "next";
import { LibraryList } from "@/components/LibraryList";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Liked" };

export default function LikedPage() {
  return (
    <>
      <PageHeader title="Liked">
        <p>Videos you liked, newest first. Likes stay in this browser and change nothing about what you are shown.</p>
      </PageHeader>
      <LibraryList list="liked" />
    </>
  );
}
