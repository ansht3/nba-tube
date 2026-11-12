import type { Metadata } from "next";
import Link from "next/link";
import { LibraryList } from "@/components/LibraryList";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="History">
        <p>
          Videos you opened, most recent first. It is stored only in this browser, and you can pause it in{" "}
          <Link href="/settings/" className="link">
            Settings
          </Link>
          .
        </p>
      </PageHeader>
      <LibraryList list="history" />
    </>
  );
}
