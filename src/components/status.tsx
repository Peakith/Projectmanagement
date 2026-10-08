import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock, Hourglass, MinusCircle, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  BOOKING_STATUS_LABELS,
  FEEDBACK_STATUS_LABELS,
  HEALTH_LABELS,
  PHASE_LABELS,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type BookingStatus,
  type FeedbackStatus,
  type Health,
  type Phase,
  type Priority,
  type TaskStatus,
} from "@/lib/domain/labels";

export function PhaseBadge({ phase }: { phase: Phase }) {
  const tone = phase === "afgerond" ? "ok" : phase === "verloren" ? "neutral" : "dark";
  return <Badge tone={tone}>{PHASE_LABELS[phase]}</Badge>;
}

export function HealthBadge({ level, title }: { level: Health; title?: string }) {
  const map = {
    op_schema: { tone: "ok" as const, Icon: CheckCircle2 },
    aandacht: { tone: "warn" as const, Icon: AlertTriangle },
    geblokkeerd: { tone: "danger" as const, Icon: Ban },
  }[level];
  return (
    <Badge tone={map.tone} title={title}>
      <map.Icon aria-hidden />
      {HEALTH_LABELS[level]}
    </Badge>
  );
}

const TASK_ICON: Record<TaskStatus, { Icon: typeof Clock; tone: "neutral" | "info" | "warn" | "danger" | "ok" }> = {
  todo: { Icon: CircleDashed, tone: "neutral" },
  bezig: { Icon: PlayCircle, tone: "info" },
  wacht_klant: { Icon: Hourglass, tone: "warn" },
  wacht_extern: { Icon: Hourglass, tone: "warn" },
  geblokkeerd: { Icon: Ban, tone: "danger" },
  nvt: { Icon: MinusCircle, tone: "neutral" },
  klaar: { Icon: CheckCircle2, tone: "ok" },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { Icon, tone } = TASK_ICON[status];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "normaal") return null;
  const tone = priority === "urgent" ? "danger" : priority === "hoog" ? "warn" : "neutral";
  return <Badge tone={tone}>{PRIORITY_LABELS[priority]}</Badge>;
}

export function BookingBadge({ status }: { status: BookingStatus }) {
  const tone = status === "bevestigd" ? "ok" : status === "geannuleerd" ? "neutral" : status === "optie" ? "info" : "warn";
  return <Badge tone={tone}>{BOOKING_STATUS_LABELS[status]}</Badge>;
}

export function FeedbackBadge({ status }: { status: FeedbackStatus }) {
  const tone = status === "verwerkt" ? "ok" : status === "wacht_op_feedback" ? "warn" : status === "gepland" ? "neutral" : "info";
  return <Badge tone={tone}>{FEEDBACK_STATUS_LABELS[status]}</Badge>;
}

/** Aandachtsindicatie met uitleg (redenen), bruikbaar zonder kleur te zien. */
export function AttentionCell({ level, reasons }: { level: Health; reasons: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <HealthBadge level={level} />
      {reasons.length > 0 && (
        <ul className="text-xs text-zinc-600">
          {reasons.slice(0, 3).map((r) => (
            <li key={r}>{r}</li>
          ))}
          {reasons.length > 3 && <li>+{reasons.length - 3} meer</li>}
        </ul>
      )}
    </div>
  );
}
