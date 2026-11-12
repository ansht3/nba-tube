import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { SettingsView } from "@/components/SettingsView";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings">
        <p>Saved in this browser and applied right away.</p>
      </PageHeader>
      <SettingsView />
    </>
  );
}
