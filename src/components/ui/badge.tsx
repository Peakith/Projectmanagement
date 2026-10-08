import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5", {
  variants: {
    tone: {
      neutral: "bg-zinc-100 text-zinc-800",
      dark: "bg-ink text-white",
      brand: "bg-brand text-ink",
      ok: "bg-green-100 text-green-900",
      warn: "bg-amber-100 text-amber-900",
      danger: "bg-red-100 text-red-900",
      info: "bg-sky-100 text-sky-900",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
