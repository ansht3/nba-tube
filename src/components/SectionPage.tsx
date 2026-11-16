import { getSection, type SectionId } from "@/catalog/content-types";
import { getCatalogRepository } from "@/catalog/server";
import { pluralize } from "@/lib/format";
import { EmptyState } from "./EmptyState";
import { PageHeader } from "./PageHeader";
import { LIST_PAGE_SIZE } from "@/lib/site";
import { VideoList } from "./VideoList";

/** The page behind /highlights, /pregame, /postgame and /interviews. */
export async function SectionPage({ sectionId }: { sectionId: SectionId }) {
  const section = getSection(sectionId);
  const { videos, total } = await getCatalogRepository().list({ section: sectionId, limit: LIST_PAGE_SIZE });

  return (
    <>
      <PageHeader title={section.title}>
        <p>
          {section.description} {total > 0 && `${pluralize(total, "video")}, newest first.`}
        </p>
      </PageHeader>
      {total === 0 ? (
        <EmptyState title={`No ${section.title.toLowerCase()} videos right now`}>
          <p>The catalog is rebuilt from the official channels on every sync. Check back after the next games.</p>
        </EmptyState>
      ) : (
        <VideoList initial={videos} total={total} scope={{ section: sectionId }} />
      )}
    </>
  );
}
