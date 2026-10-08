import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-ink placeholder:text-zinc-400 disabled:bg-zinc-100 aria-[invalid=true]:border-red-600";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(base, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(base, "min-h-20 py-2", className)} {...props} />;
}

/** Native select: toegankelijk en prettig op mobiel. */
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(base, "h-9 pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-semibold text-zinc-800", className)} {...props} />;
}

export function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="checkbox" className={cn("size-4 rounded border-zinc-400 accent-ink", className)} {...props} />;
}
