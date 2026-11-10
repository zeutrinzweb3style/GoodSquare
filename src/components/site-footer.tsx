export function SiteFooter() {
  return (
    <footer className="relative mt-8 border-t border-border">
      <div className="gs-hairline absolute inset-x-0 -top-px h-px" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Good Square — Open Community Infrastructure. Community-owned ·
          Open-source · Transparent · Interoperable.
        </p>
        <p className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Built on Celo. Non-custodial by design.
        </p>
      </div>
    </footer>
  );
}
