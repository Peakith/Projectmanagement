export const PHASES = [
  "deal",
  "strategie",
  "preproductie",
  "productie",
  "postproductie",
  "oplevering",
  "afronding",
  "evaluatie",
  "afgerond",
  "verloren",
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  deal: "Deal / offerte",
  strategie: "Strategie & concept",
  preproductie: "Pre-productie",
  productie: "Productie",
  postproductie: "Post-productie",
  oplevering: "Oplevering",
  afronding: "Afronding & betaling",
  evaluatie: "Evaluatie",
  afgerond: "Afgerond",
  verloren: "Verloren / geannuleerd",
};

/** Fases waarin een project als 'lopend' telt. */
export const ACTIVE_PHASES: Phase[] = PHASES.filter((p) => p !== "afgerond" && p !== "verloren");
export const isActivePhase = (p: Phase) => ACTIVE_PHASES.includes(p);

export const TASK_STATUSES = ["todo", "bezig", "wacht_klant", "wacht_extern", "geblokkeerd", "nvt", "klaar"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Te doen",
  bezig: "Bezig",
  wacht_klant: "Wacht op klant",
  wacht_extern: "Wacht op freelancer / leverancier",
  geblokkeerd: "Geblokkeerd",
  nvt: "Niet van toepassing",
  klaar: "Klaar",
};
export const isOpenStatus = (s: TaskStatus) => s !== "klaar" && s !== "nvt";
export const isWaitingStatus = (s: TaskStatus) => s === "wacht_klant" || s === "wacht_extern";
export const CREW_TASK_STATUSES: TaskStatus[] = ["todo", "bezig", "wacht_extern", "klaar"];

export const PRIORITIES = ["laag", "normaal", "hoog", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = { laag: "Laag", normaal: "Normaal", hoog: "Hoog", urgent: "Urgent" };
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, hoog: 1, normaal: 2, laag: 3 };

export const HEALTHS = ["op_schema", "aandacht", "geblokkeerd"] as const;
export type Health = (typeof HEALTHS)[number];
export const HEALTH_LABELS: Record<Health, string> = { op_schema: "Op schema", aandacht: "Aandacht nodig", geblokkeerd: "Geblokkeerd" };

export const BOOKING_STATUSES = ["benaderen", "aangevraagd", "optie", "bevestigd", "geannuleerd"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  benaderen: "Nog benaderen",
  aangevraagd: "Aangevraagd",
  optie: "Optie",
  bevestigd: "Bevestigd",
  geannuleerd: "Geannuleerd",
};

export const AVAILABILITY = ["onbekend", "beschikbaar", "beperkt", "niet_beschikbaar"] as const;
export type Availability = (typeof AVAILABILITY)[number];
export const AVAILABILITY_LABELS: Record<Availability, string> = {
  onbekend: "Onbekend",
  beschikbaar: "Beschikbaar",
  beperkt: "Beperkt beschikbaar",
  niet_beschikbaar: "Niet beschikbaar",
};

export const FEEDBACK_STATUSES = ["gepland", "wacht_op_feedback", "feedback_ontvangen", "in_verwerking", "verwerkt"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  gepland: "Gepland",
  wacht_op_feedback: "Wacht op feedback",
  feedback_ontvangen: "Feedback ontvangen",
  in_verwerking: "In verwerking",
  verwerkt: "Verwerkt",
};

export const APPROVAL_SOURCES = ["vimeo", "email", "mondeling", "anders"] as const;
export type ApprovalSource = (typeof APPROVAL_SOURCES)[number];
export const APPROVAL_SOURCE_LABELS: Record<ApprovalSource, string> = {
  vimeo: "Vimeo",
  email: "E-mail",
  mondeling: "Mondeling / telefonisch",
  anders: "Anders",
};

export const ROLES = ["owner", "employee", "freelancer", "client"] as const;
export type AppRole = (typeof ROLES)[number];
export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Eigenaar",
  employee: "Medewerker / stagiaire",
  freelancer: "Freelancer",
  client: "Klant",
};

export const DATE_ANCHOR_LABELS = {
  none: "Geen",
  project_start: "Projectstart",
  project_deadline: "Projectdeadline",
  shoot_day: "Draaidag",
} as const;
export type DateAnchor = keyof typeof DATE_ANCHOR_LABELS;

export const COST_CATEGORIES = ["freelancer", "huur", "reis", "materiaal", "licenties", "overig"] as const;
export const COST_CATEGORY_LABELS: Record<(typeof COST_CATEGORIES)[number], string> = {
  freelancer: "Freelancer",
  huur: "Huur",
  reis: "Reiskosten",
  materiaal: "Materiaal",
  licenties: "Licenties",
  overig: "Overig",
};

export const DEFAULT_CREW_ROLES = ["Camera", "Regie", "Productie", "Montage", "Sound", "Styling", "Licht", "Grip", "Drone"];
