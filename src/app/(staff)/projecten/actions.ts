"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { dbError, formObject, zDate, zodError, zUuid, type ActionResult } from "@/lib/actions";
import { PRIORITIES } from "@/lib/domain/labels";

const createSchema = z
  .object({
    name: z.string().trim().min(1, "Projectnaam is verplicht").max(200),
    client_id: zUuid.nullable(),
    new_client_name: z.string().trim().max(200).nullable(),
    brand_id: zUuid.nullable(),
    lead_id: zUuid.nullable(),
    template_id: zUuid.nullable(),
    project_type: z.string().max(100).nullable(),
    priority: z.enum(PRIORITIES).default("normaal"),
    start_date: zDate.nullable(),
    deadline: zDate.nullable(),
    shoot_dates: z.array(zDate).max(20),
    briefing: z.string().max(5000).nullable(),
    goal: z.string().max(2000).nullable(),
    target_audience: z.string().max(2000).nullable(),
  })
  .refine((v) => !v.start_date || !v.deadline || v.start_date <= v.deadline, { message: "Startdatum ligt na de deadline", path: ["deadline"] });

export async function createProject(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const parsed = createSchema.safeParse(formObject(fd, ["shoot_dates"]));
  if (!parsed.success) return zodError(parsed.error);
  const { data, error } = await s.supabase.rpc("create_project", { p: parsed.data });
  if (error) return dbError(error);
  revalidatePath("/");
  redirect(`/projecten/${data}?nieuw=1`);
}
