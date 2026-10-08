export type ActionResult =
  | { ok: true; message?: string; id?: string; data?: unknown }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
