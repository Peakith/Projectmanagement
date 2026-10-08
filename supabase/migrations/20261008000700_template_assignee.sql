-- Taken uit de template krijgen standaard de projectverantwoordelijke als interne
-- verantwoordelijke, zodat altijd iemand de voortgang bewaakt (ook bij freelancers zonder account).

create or replace function app_private.instantiate_template(
  p_project uuid, p_version uuid, p_shoot_day uuid, p_actor uuid
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
  v_label text;
begin
  if p_shoot_day is not null then
    select to_char(shoot_date, 'DD-MM') into v_label from public.shoot_days where id = p_shoot_day;
  end if;
  insert into public.tasks (
    project_id, phase, sort, title, description, checklist, priority, anchor, offset_days,
    optional, due_date, shoot_day_id, template_task_id, signal_key, created_by, assignee_id
  )
  select p_project, tt.phase, tt.sort,
         case when p_shoot_day is null then tt.title else tt.title || ' — draaidag ' || v_label end,
         tt.description,
         coalesce((select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'text', item #>> '{}', 'done', false))
                     from jsonb_array_elements(tt.checklist) item), '[]'::jsonb),
         tt.priority, tt.anchor, tt.offset_days, tt.optional,
         app_private.anchor_date(p_project, tt.anchor, p_shoot_day) + tt.offset_days,
         p_shoot_day, tt.id, tt.signal_key, p_actor,
         (select lead_id from public.projects where id = p_project)
    from public.template_tasks tt
   where tt.template_version_id = p_version
     and tt.per_shoot_day = (p_shoot_day is not null)
   order by tt.phase, tt.sort;
  get diagnostics n = row_count;
  return n;
end;
$$;

