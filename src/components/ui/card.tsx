import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-lg border border-zinc-200 bg-white", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
  as: As = "h2",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3", className)}>
      <div>
        <As className="text-base font-bold">{title}</As>
        {description && <p className="mt-0.5 text-sm text-zinc-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}
