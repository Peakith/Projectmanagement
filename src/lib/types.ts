import type { DateAnchor, Health, Phase, Priority, TaskStatus, BookingStatus, FeedbackStatus, ApprovalSource, Availability } from "./domain/labels";

export type Project = {
  id: string;
  name: string;
  client_id: string | null;
  brand_id: string;
  lead_id: string | null;
  project_type: string;
  briefing: string;
  goal: string;
  target_audience: string;
  strategy: string;
  concept: string;
  crew_briefing: string;
  start_date: string | null;
  deadline: string | null;
  phase: Phase;
  phase_changed_at: string;
  priority: Priority;
  health: Health;
  health_note: string;
  next_action_task_id: string | null;
  next_action_text: string | null;
  next_action_assignee_id: string | null;
  next_action_date: string | null;
  next_action_needs_update: boolean;
  follow_up_date: string | null;
  template_version_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Task = {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  phase: Phase;
  sort: number;
  title: string;
  description: string;
  checklist: ChecklistItem[];
  status: TaskStatus;
  priority: Priority;
  assignee_id: string | null;
  freelancer_id: string | null;
  shared_with_freelancer: boolean;
  due_date: string | null;
  anchor: DateAnchor;
  offset_days: number;
  optional: boolean;
  waiting_since: string | null;
  blocked_reason: string | null;
  nvt_reason: string | null;
  follow_up_date: string | null;
  shoot_day_id: string | null;
  deliverable_id: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ShootDay = {
  id: string;
  project_id: string;
  shoot_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string;
  address: string;
  schedule: string;
  callsheet_url: string | null;
  crew_notes: string;
  internal_notes: string;
};

export type Freelancer = {
  id: string;
  name: string;
  specialisms: string[];
  email: string | null;
  phone: string | null;
  city: string;
  notes: string;
  availability: Availability;
  availability_note: string;
  user_id: string | null;
  active: boolean;
};

export type Booking = {
  id: string;
  project_id: string;
  freelancer_id: string;
  role: string;
  work_description: string;
  status: BookingStatus;
  internal_notes: string;
};

export type Deliverable = {
  id: string;
  project_id: string;
  name: string;
  goal: string;
  scope: string;
  planned_delivery_date: string | null;
  formats: string[];
  included_rounds: number;
  approved_version_id: string | null;
  approved_on: string | null;
  approval_source: ApprovalSource | null;
  approval_reference: string;
  delivered_on: string | null;
  sort: number;
};

export type DeliverableVersion = {
  id: string;
  deliverable_id: string;
  version_number: number;
  delivered_on: string;
  review_url: string | null;
  notes: string;
};

export type FeedbackRound = {
  id: string;
  deliverable_id: string;
  round_number: number;
  is_extra: boolean;
  version_id: string | null;
  status: FeedbackStatus;
  requested_on: string | null;
  feedback_due: string | null;
  received_on: string | null;
  processed_on: string | null;
  notes: string;
  extra_reason: string | null;
  extra_approved_at: string | null;
};

export type Profile = { id: string; full_name: string; email: string | null };
export type Client = { id: string; name: string };
export type Brand = { id: string; name: string; slug: string };
