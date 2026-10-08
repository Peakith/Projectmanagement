"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/domain/labels";
import { quickStatus } from "./_actions/tasks";

/** Statuswijziging in één klik; geblokkeerd en n.v.t. vragen om een reden. */
export function QuickStatus({ projectId, taskId, status, label }: { projectId: string; taskId: string; status: TaskStatus; label: string }) {
  const [value, setValue] = useState<TaskStatus>(status);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const needsReason = (value === "geblokkeerd" || value === "nvt") && value !== status;
  const save = (st: TaskStatus, r?: string) =>
    start(async () => {
      const res = await quickStatus(projectId, taskId, st, r);
      if (res.ok) toast.success(res.message ?? "Opgeslagen");
      else {
        toast.error(res.error);
        setValue(status);
      }
    });
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`qs-${taskId}`} className="sr-only">
        Status van {label}
      </label>
      <Select
        id={`qs-${taskId}`}
        value={value}
        disabled={pending}
        aria-busy={pending}
        className="h-8 w-48 text-xs"
        onChange={(e) => {
          const v = e.target.value as TaskStatus;
          setValue(v);
          if (v !== "geblokkeerd" && v !== "nvt") save(v);
        }}
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
      {needsReason && (
        <div className="flex gap-1">
          <label htmlFor={`qr-${taskId}`} className="sr-only">
            Reden
          </label>
          <Input id={`qr-${taskId}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reden (verplicht)" className="h-8 text-xs" autoFocus />
          <Button size="sm" disabled={!reason.trim() || pending} onClick={() => save(value, reason)}>
            OK
          </Button>
        </div>
      )}
    </div>
  );
}
