import Link from "next/link";
import { cn } from "@/lib/utils";

/** Tekstueel woordmerk (geen officieel logo aangeleverd). Linkt altijd naar het centrale dashboard. */
export function Wordmark({ href = "/", className, dark = true }: { href?: string; className?: string; dark?: boolean }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-heading font-extrabold tracking-tight", className)} aria-label="Studio Brutaal — naar het dashboard">
      <span aria-hidden className="inline-block size-3.5 bg-brand" />
      <span className={dark ? "text-white" : "text-ink"}>
        STUDIO <span className="font-bold">BRUTAAL</span>
      </span>
    </Link>
  );
}
