import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./input";

/** Formulierveld met label, hint en foutmelding (gekoppeld via aria-describedby). */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
  required,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-zinc-500"> *</span>}
      </Label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
