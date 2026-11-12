import { Footer } from "@/components/Footer";
import { NavLinks } from "@/components/nav";

/** Every page except the watch page: the guide sidebar on the left, content beside it. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <aside className="site-sidebar fixed bottom-0 left-0 top-14 hidden overflow-y-auto border-r border-line lg:block">
        <NavLinks />
      </aside>
      <div className="site-content">
        <main id="main" className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6">
          {children}
        </main>
        <Footer />
      </div>
    </>
  );
}
