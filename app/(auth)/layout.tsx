import type { ReactNode } from "react";

// Public pages (sign in, sign up): no sidebar, just the form centered on the page.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="mb-6 flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-widest text-fg">
        <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-accent" />
        Meeting log
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
