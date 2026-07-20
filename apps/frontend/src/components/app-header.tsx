import { ShieldCheck } from "lucide-react";

export function AppHeader() {
  return (
    <header className="border-b border-[var(--color-border)] bg-[rgba(255,255,255,0.86)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-sm font-semibold text-[var(--color-primary)]">PDF &lt;&gt; Form</p>
          <h1 className="text-3xl font-bold tracking-normal text-[var(--color-ink)]">DocElla</h1>
        </div>
        <p className="flex max-w-md items-center gap-2 text-sm text-[var(--color-muted)]">
          <ShieldCheck
            aria-hidden="true"
            className="h-4 w-4 flex-none text-[var(--color-primary)]"
          />
          Documents are processed without persistent storage.
        </p>
      </div>
    </header>
  );
}
