"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** One quiet block for "nothing here": a short statement and, when it helps, what to do next. */
export function EmptyState({ title, children, focusOnMount = false }: { title: string; children?: ReactNode; focusOnMount?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) box.current?.focus();
  }, [focusOnMount]);

  return (
    // Focusable so a page can move focus here after its last item is removed.
    <div ref={box} tabIndex={-1} className="rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
