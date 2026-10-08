import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ title, children, className }: { title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-md border border-dashed border-zinc-300 px-4 py-6 text-center", className)}>
      <p className="font-semibold text-zinc-800">{title}</p>
      {children && <div className="mt-1 text-sm text-zinc-600">{children}</div>}
    </div>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warn" | "danger" | "ok"; title?: string; children?: React.ReactNode }) {
  const tones = {
    info: "border-sky-300 bg-sky-50 text-sky-950",
    warn: "border-amber-300 bg-amber-50 text-amber-950",
    danger: "border-red-300 bg-red-50 text-red-950",
    ok: "border-green-300 bg-green-50 text-green-950",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-md border px-4 py-3 text-sm", tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
