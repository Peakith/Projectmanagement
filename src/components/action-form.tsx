"use client";
import * as React from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const FormStateContext = React.createContext<ActionResult | null>(null);
export const useFieldError = (name: string) => {
  const s = React.useContext(FormStateContext);
  return s && !s.ok ? s.fieldErrors?.[name] : undefined;
};

/**
 * Formulier rond een Server Action: toont laadstatus, foutmelding en een bevestiging na opslaan.
 */
export function ActionForm({
  action,
  children,
  className,
  success = "Opgeslagen",
  onSuccess,
  resetOnSuccess = false,
  confirm,
  ...rest
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  success?: string | false;
  onSuccess?: (r: ActionResult) => void;
  resetOnSuccess?: boolean;
  confirm?: string;
} & Omit<React.ComponentProps<"form">, "action" | "onSubmit">) {
  const [state, formAction] = React.useActionState(action, null);
  const ref = React.useRef<HTMLFormElement>(null);
  const handled = React.useRef<ActionResult | null>(null);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (success !== false) toast.success(state.message ?? success);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    } else {
      toast.error(state.error);
    }
  }, [state, success, resetOnSuccess, onSuccess]);

  return (
    <FormStateContext.Provider value={state}>
      <form
        ref={ref}
        action={formAction}
        className={className}
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
        {...rest}
      >
        {children}
        {state && !state.ok && (
          <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
            {state.error}
          </p>
        )}
      </form>
    </FormStateContext.Provider>
  );
}

export function SubmitButton({ children, className, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={cn(className)} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
