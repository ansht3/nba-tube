import type { Metadata } from "next";
import { getSection } from "@/catalog/content-types";
import { SectionPage } from "@/components/SectionPage";

const section = getSection("pregame");

export const metadata: Metadata = { title: section.title, description: section.description };

export default function PregamePage() {
  return <SectionPage sectionId="pregame" />;
}
