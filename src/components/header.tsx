import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface-raised/80 backdrop-blur-sm">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md font-heading text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
        >
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="hidden sm:inline">AccessReady</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
