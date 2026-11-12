import type { Metadata } from "next";
import { getSection } from "@/catalog/content-types";
import { SectionPage } from "@/components/SectionPage";

const section = getSection("interviews");

export const metadata: Metadata = { title: section.title, description: section.description };

export default function InterviewsPage() {
  return <SectionPage sectionId="interviews" />;
}
