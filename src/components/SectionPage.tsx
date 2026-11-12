import { getSection, type SectionId } from "@/catalog/content-types";
import { loadCatalog } from "@/catalog/load";
import { videosInSection } from "@/catalog/select";
import { pluralize } from "@/lib/format";
import { EmptyState } from "./EmptyState";
import { PageHeader } from "./PageHeader";
import { LIST_PAGE_SIZE, VideoList } from "./VideoList";

/** The page behind /highlights, /pregame, /postgame and /interviews. */
export function SectionPage({ sectionId }: { sectionId: SectionId }) {
  const section = getSection(sectionId);
  const videos = videosInSection(loadCatalog().videos, sectionId);

  return (
    <>
      <PageHeader title={section.title}>
        <p>
          {section.description} {videos.length > 0 && `${pluralize(videos.length, "video")}, newest first.`}
        </p>
      </PageHeader>
      {videos.length === 0 ? (
        <EmptyState title={`No ${section.title.toLowerCase()} videos right now`}>
          <p>The catalog is rebuilt from the official channels on every sync. Check back after the next games.</p>
        </EmptyState>
      ) : (
        <VideoList initial={videos.slice(0, LIST_PAGE_SIZE)} total={videos.length} scope={{ section: sectionId }} />
      )}
    </>
  );
}
