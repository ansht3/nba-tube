import type { ReactNode } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {children && <div className="mt-1 max-w-2xl text-sm text-muted">{children}</div>}
    </header>
  );
}
