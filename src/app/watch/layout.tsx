import { Footer } from "@/components/Footer";

/** The watch page uses the full width for the player and the related list, as on YouTube. */
export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main id="main" className="mx-auto max-w-[1760px] px-4 py-6 sm:px-6">
        {children}
      </main>
      <Footer />
    </>
  );
}
