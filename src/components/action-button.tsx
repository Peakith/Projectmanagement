"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

/** Knop die één Server Action uitvoert, met optionele bevestiging (voor destructieve acties). */
export function ActionButton({
  action,
  confirm,
  children,
  ...props
}: { action: () => Promise<ActionResult>; confirm?: string } & Omit<React.ComponentProps<typeof Button>, "onClick" | "action">) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      type="button"
      disabled={pending || props.disabled}
      aria-busy={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (r.ok) toast.success(r.message ?? "Opgeslagen");
          else toast.error(r.error);
        });
      }}
      {...props}
    >
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
