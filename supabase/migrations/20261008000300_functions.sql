-- Bedrijfslogica in de database: transactionele projectaanmaak, planning,
-- beperkte freelancer-acties, audit, meldingen, jobs en offerte-integratie.

-- ---------------------------------------------------------------------------
-- Labels (Nederlands) voor activiteit en meldingen
-- ---------------------------------------------------------------------------
create or replace function app_private.phase_label(p public.project_phase)
returns text language sql immutable set search_path = ''
as $$
  select case p
    when 'deal' then 'Deal / offerte'
    when 'strategie' then 'Strategie & concept'
    when 'preproductie' then 'Pre-productie'
    when 'productie' then 'Productie'
    when 'postproductie' then 'Post-productie'
    when 'oplevering' then 'Oplevering'
    when 'afronding' then 'Afronding & betaling'
    when 'evaluatie' then 'Evaluatie'
    when 'afgerond' then 'Afgerond'
    when 'verloren' then 'Verloren / geannuleerd'
  end
$$;

create or replace function app_private.status_label(s public.task_status)
returns text language sql immutable set search_path = ''
as $$
  select case s
    when 'todo' then 'Te doen'
    when 'bezig' then 'Bezig'
    when 'wacht_klant' then 'Wacht op klant'
    when 'wacht_extern' then 'Wacht op freelancer / leverancier'
    when 'geblokkeerd' then 'Geblokkeerd'
    when 'nvt' then 'Niet van toepassing'
    when 'klaar' then 'Klaar'
  end
$$;

-- ---------------------------------------------------------------------------
-- Meldingen
-- ---------------------------------------------------------------------------
create or replace function app_private.notify(
  p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_project uuid, p_dedupe text
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if p_user is null then return 0; end if;
  insert into public.notifications (user_id, kind, title, body, link, project_id, dedupe_key)
  values (p_user, p_kind, p_title, coalesce(p_body, ''), p_link, p_project, p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Ontvangers voor projectsignalen: projectverantwoordelijke (indien actief intern) + eigenaren.
create or replace function app_private.project_recipients(p_project uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select ur.user_id from public.user_roles ur where ur.role = 'owner' and ur.active
  union
  select p.lead_id from public.projects p
    join public.user_roles ur on ur.user_id = p.lead_id and ur.active and ur.role in ('owner', 'employee')
   where p.id = p_project
$$;

create or replace function app_private.owner_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$ select user_id from public.user_roles where role = 'owner' and active $$;

-- ---------------------------------------------------------------------------
-- Template-instantiatie en planning
-- ---------------------------------------------------------------------------
create or replace function app_private.anchor_date(
  p_project uuid, p_anchor public.date_anchor, p_shoot_day uuid
) returns date
language sql stable security definer set search_path = ''
as $$
  select case p_anchor
    when 'project_start' then (select start_date from public.projects where id = p_project)
    when 'project_deadline' then (select deadline from public.projects where id = p_project)
    when 'shoot_day' then coalesce(
      (select shoot_date from public.shoot_days where id = p_shoot_day),
      case when p_shoot_day is null
        then (select min(shoot_date) from public.shoot_days where project_id = p_project) end)
    else null
  end
$$;

-- Maakt taken aan op basis van een templateversie. Zonder p_shoot_day: alle taken
-- die niet per draaidag zijn; met p_shoot_day: de taken per draaidag.
-- Ontbreekt de referentiedatum, dan blijft de deadline leeg (ongepland).
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
    optional, due_date, shoot_day_id, template_task_id, signal_key, created_by
  )
  select p_project, tt.phase, tt.sort,
         case when p_shoot_day is null then tt.title else tt.title || ' — draaidag ' || v_label end,
         tt.description,
         coalesce((select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'text', item #>> '{}', 'done', false))
                     from jsonb_array_elements(tt.checklist) item), '[]'::jsonb),
         tt.priority, tt.anchor, tt.offset_days, tt.optional,
         app_private.anchor_date(p_project, tt.anchor, p_shoot_day) + tt.offset_days,
         p_shoot_day, tt.id, tt.signal_key, p_actor
    from public.template_tasks tt
   where tt.template_version_id = p_version
     and tt.per_shoot_day = (p_shoot_day is not null)
   order by tt.phase, tt.sort;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function app_private.latest_template_version(p_template uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select tv.id from public.template_versions tv
   where tv.template_id = coalesce(p_template, (select id from public.templates where is_default))
     and tv.published_at is not null
   order by tv.version desc limit 1
$$;

-- Kern van projectaanmaak; gebruikt door de app (via create_project) en de integratie.
create or replace function app_private.create_project_core(p jsonb, p_actor uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_project uuid;
  v_client uuid;
  v_brand uuid;
  v_version uuid;
  v_day date;
  v_shoot uuid;
begin
  v_client := nullif(p ->> 'client_id', '')::uuid;
  if v_client is null and nullif(trim(p ->> 'new_client_name'), '') is not null then
    select id into v_client from public.clients where lower(name) = lower(trim(p ->> 'new_client_name'));
    if v_client is null then
      insert into public.clients (name, created_by) values (trim(p ->> 'new_client_name'), p_actor)
      returning id into v_client;
    end if;
  end if;
  v_brand := coalesce(nullif(p ->> 'brand_id', '')::uuid, (select id from public.brands where slug = 'studio-brutaal'));
  v_version := app_private.latest_template_version(nullif(p ->> 'template_id', '')::uuid);
  if v_version is null then
    raise exception 'Geen gepubliceerde templateversie gevonden';
  end if;

  insert into public.projects (
    name, client_id, brand_id, lead_id, project_type, briefing, goal, target_audience,
    start_date, deadline, priority, phase, template_version_id, created_by, updated_by
  ) values (
    trim(p ->> 'name'), v_client, v_brand,
    coalesce(nullif(p ->> 'lead_id', '')::uuid, p_actor),
    coalesce(p ->> 'project_type', ''), coalesce(p ->> 'briefing', ''), coalesce(p ->> 'goal', ''),
    coalesce(p ->> 'target_audience', ''),
    nullif(p ->> 'start_date', '')::date, nullif(p ->> 'deadline', '')::date,
    coalesce(nullif(p ->> 'priority', ''), 'normaal')::public.priority,
    coalesce(nullif(p ->> 'phase', ''), 'deal')::public.project_phase,
    v_version, p_actor, p_actor
  ) returning id into v_project;

  -- Draaidagen eerst, zodat taken met een draaidag als referentie meteen een datum krijgen.
  for v_day in
    select distinct d::date from jsonb_array_elements_text(coalesce(p -> 'shoot_dates', '[]'::jsonb)) d order by 1
  loop
    insert into public.shoot_days (project_id, shoot_date) values (v_project, v_day) returning id into v_shoot;
  end loop;

  perform app_private.instantiate_template(v_project, v_version, null, p_actor);
  for v_shoot in select id from public.shoot_days where project_id = v_project order by shoot_date loop
    perform app_private.instantiate_template(v_project, v_version, v_shoot, p_actor);
  end loop;

  insert into finance.project_finances (project_id) values (v_project);
  return v_project;
end;
$$;

create or replace function public.create_project(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  if not app_private.is_staff() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  if nullif(trim(p ->> 'name'), '') is null then
    raise exception 'Projectnaam is verplicht';
  end if;
  if nullif(p ->> 'lead_id', '') is not null and not exists (
    select 1 from public.user_roles where user_id = (p ->> 'lead_id')::uuid and active and role in ('owner', 'employee')
  ) then
    raise exception 'Projectverantwoordelijke moet een interne gebruiker zijn';
  end if;
  return app_private.create_project_core(p, auth.uid());
end;
$$;

-- Draaidag toevoegen inclusief de werkzaamheden per draaidag uit de templateversie van het project.
create or replace function public.add_shoot_day(
  p_project uuid, p_date date, p_start time default null, p_end time default null,
  p_location text default '', p_address text default '', p_with_tasks boolean default true
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_version uuid;
begin
  if not app_private.is_staff() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  insert into public.shoot_days (project_id, shoot_date, start_time, end_time, location, address)
  values (p_project, p_date, p_start, p_end, coalesce(p_location, ''), coalesce(p_address, ''))
  returning id into v_id;
  select template_version_id into v_version from public.projects where id = p_project;
  if p_with_tasks and v_version is not null then
    perform app_private.instantiate_template(p_project, v_version, v_id, auth.uid());
  end if;
  return v_id;
end;
$$;

-- Planningsvoorstel: taken met een referentiedatum waarvan de berekende datum afwijkt.
-- Security invoker: RLS bepaalt welke taken zichtbaar zijn.
create or replace function public.plan_proposal(p_project uuid)
returns table (task_id uuid, title text, phase public.project_phase, current_due date, proposed_due date, anchor public.date_anchor)
language sql stable security invoker set search_path = ''
as $$
  select t.id, t.title, t.phase, t.due_date,
         app_private.anchor_date(t.project_id, t.anchor, t.shoot_day_id) + t.offset_days,
         t.anchor
    from public.tasks t
   where t.project_id = p_project
     and t.anchor <> 'none'
     and t.status not in ('klaar', 'nvt')
     and (app_private.anchor_date(t.project_id, t.anchor, t.shoot_day_id) + t.offset_days) is distinct from t.due_date
   order by t.phase, t.sort
$$;

create or replace function public.apply_plan_proposal(p_project uuid, p_task_ids uuid[])
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  n integer;
begin
  update public.tasks t
     set due_date = app_private.anchor_date(t.project_id, t.anchor, t.shoot_day_id) + t.offset_days
   where t.project_id = p_project and t.id = any (p_task_ids) and t.anchor <> 'none'
     and t.status not in ('klaar', 'nvt');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Mogelijke dubbele boekingen: dezelfde freelancer, bevestigd, op dezelfde datum in verschillende boekingen.
create or replace function public.booking_overlaps()
returns table (freelancer_id uuid, freelancer_name text, shoot_date date, booking_ids uuid[], project_ids uuid[])
language sql stable security invoker set search_path = ''
as $$
  select f.id, f.name, sd.shoot_date, array_agg(distinct b.id), array_agg(distinct b.project_id)
    from public.bookings b
    join public.freelancers f on f.id = b.freelancer_id
    join public.booking_shoot_days bsd on bsd.booking_id = b.id
    join public.shoot_days sd on sd.id = bsd.shoot_day_id
   where b.status = 'bevestigd'
   group by f.id, f.name, sd.shoot_date
  having count(distinct b.id) > 1
$$;

-- ---------------------------------------------------------------------------
-- Eigenaar: rollen en accounts beheren (alleen eigenaar; nooit de eigen rol)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_role(p_user uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app_private.is_owner() then
    raise exception 'Alleen de eigenaar kan rollen beheren' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Je kunt je eigen rol niet wijzigen' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'De eigenaarsrol wordt alleen via de gedocumenteerde serverprocedure toegekend' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'owner') then
    raise exception 'Een eigenaar kan hier niet worden gewijzigd' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role, created_by)
  values (p_user, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role, active = true, deactivated_at = null;
  -- Rolwijziging trekt projectgebonden toegang van een vorige rol in.
  if p_role <> 'client' then
    update public.portal_access set revoked_at = now(), revoked_by = auth.uid()
     where user_id = p_user and revoked_at is null;
  end if;
  if p_role <> 'freelancer' then
    update public.freelancers set user_id = null where user_id = p_user;
  end if;
end;
$$;

create or replace function public.admin_set_active(p_user uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app_private.is_owner() then
    raise exception 'Alleen de eigenaar kan toegang beheren' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Je kunt je eigen toegang niet wijzigen' using errcode = '42501';
  end if;
  update public.user_roles
     set active = p_active, deactivated_at = case when p_active then null else now() end
   where user_id = p_user and role <> 'owner';
end;
$$;

create or replace function public.admin_link_freelancer(p_freelancer uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app_private.is_owner() then
    raise exception 'Alleen de eigenaar kan accounts koppelen' using errcode = '42501';
  end if;
  if p_user is not null and not exists (
    select 1 from public.user_roles where user_id = p_user and role = 'freelancer'
  ) then
    raise exception 'Alleen een account met de rol freelancer kan worden gekoppeld';
  end if;
  update public.freelancers set user_id = null where user_id = p_user and id <> p_freelancer;
  update public.freelancers set user_id = p_user where id = p_freelancer;
end;
$$;

create or replace function public.admin_list_users()
returns table (user_id uuid, email text, full_name text, role public.app_role, active boolean,
               freelancer_id uuid, last_sign_in_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_owner() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, coalesce(pr.full_name, ''), ur.role, coalesce(ur.active, false),
           (select f.id from public.freelancers f where f.user_id = u.id), u.last_sign_in_at, u.created_at
      from auth.users u
      left join public.user_roles ur on ur.user_id = u.id
      left join public.profiles pr on pr.id = u.id
     order by ur.role nulls last, pr.full_name;
end;
$$;

-- Portaaltoegang alleen voor accounts met klantrol.
create or replace function app_private.check_portal_access()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.revoked_at is null and not exists (
    select 1 from public.user_roles where user_id = new.user_id and role = 'client'
  ) then
    raise exception 'Portaaltoegang kan alleen aan een klantaccount worden gegeven';
  end if;
  return new;
end;
$$;
create trigger portal_access_check before insert or update on public.portal_access
  for each row execute function app_private.check_portal_access();

-- ---------------------------------------------------------------------------
-- Freelancer met account: alleen toegewezen projecten en expliciet gedeelde taken
-- ---------------------------------------------------------------------------
create or replace function app_private.my_freelancer_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select f.id from public.freelancers f
    join public.user_roles ur on ur.user_id = f.user_id and ur.role = 'freelancer' and ur.active
   where f.user_id = (select auth.uid()) and f.active
$$;

create or replace function app_private.crew_has_project(p_project uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
     where b.project_id = p_project
       and b.freelancer_id = app_private.my_freelancer_id()
       and b.status in ('aangevraagd', 'optie', 'bevestigd')
  ) and exists (
    select 1 from public.projects p where p.id = p_project and p.archived_at is null
  )
$$;

create or replace function public.crew_projects()
returns table (project_id uuid, name text, client_name text, phase public.project_phase,
               next_shoot_date date, my_roles text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, c.name, p.phase,
         (select min(sd.shoot_date) from public.shoot_days sd
            join public.booking_shoot_days bsd on bsd.shoot_day_id = sd.id
            join public.bookings b2 on b2.id = bsd.booking_id
           where sd.project_id = p.id and b2.freelancer_id = app_private.my_freelancer_id()
             and sd.shoot_date >= current_date),
         (select string_agg(nullif(b3.role, ''), ', ') from public.bookings b3
           where b3.project_id = p.id and b3.freelancer_id = app_private.my_freelancer_id()
             and b3.status <> 'geannuleerd')
    from public.projects p
    left join public.clients c on c.id = p.client_id
   where app_private.crew_has_project(p.id)
   order by p.name
$$;

create or replace function public.crew_project(p_project uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_fid uuid := app_private.my_freelancer_id();
  v jsonb;
begin
  if v_fid is null or not app_private.crew_has_project(p_project) then
    raise exception 'Geen toegang tot dit project' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'client_name', c.name, 'phase', p.phase,
    'crew_briefing', p.crew_briefing,
    'bookings', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'role', b.role, 'work_description', b.work_description, 'status', b.status) order by b.created_at), '[]')
       from public.bookings b where b.project_id = p.id and b.freelancer_id = v_fid and b.status <> 'geannuleerd'),
    'shoot_days', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', sd.id, 'shoot_date', sd.shoot_date, 'start_time', sd.start_time, 'end_time', sd.end_time,
        'location', sd.location, 'address', sd.address, 'schedule', sd.schedule,
        'callsheet_url', sd.callsheet_url, 'crew_notes', sd.crew_notes,
        'crew', (select coalesce(jsonb_agg(jsonb_build_object('name', f2.name, 'role', b2.role) order by f2.name), '[]')
                   from public.booking_shoot_days bsd2
                   join public.bookings b2 on b2.id = bsd2.booking_id and b2.status in ('optie', 'bevestigd')
                   join public.freelancers f2 on f2.id = b2.freelancer_id
                  where bsd2.shoot_day_id = sd.id)
      ) order by sd.shoot_date), '[]')
       from public.shoot_days sd
      where sd.project_id = p.id and exists (
        select 1 from public.booking_shoot_days bsd join public.bookings b on b.id = bsd.booking_id
         where bsd.shoot_day_id = sd.id and b.freelancer_id = v_fid and b.status <> 'geannuleerd')),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'description', t.description, 'checklist', t.checklist,
        'status', t.status, 'due_date', t.due_date, 'shoot_day_id', t.shoot_day_id,
        'comments', (select coalesce(jsonb_agg(jsonb_build_object(
                        'body', tc.body, 'created_at', tc.created_at,
                        'author', coalesce((select full_name from public.profiles where id = tc.author_id), '')) order by tc.created_at), '[]')
                       from public.task_comments tc where tc.task_id = t.id and tc.visible_to_crew)
      ) order by t.due_date nulls last, t.sort), '[]')
       from public.tasks t
      where t.project_id = p.id and t.freelancer_id = v_fid and t.shared_with_freelancer),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'kind', d.kind, 'url', d.url, 'file_name', d.file_name) order by d.created_at), '[]')
       from public.documents d where d.project_id = p.id and d.visibility = 'crew')
  ) into v
  from public.projects p left join public.clients c on c.id = p.client_id
  where p.id = p_project;
  return v;
end;
$$;

-- Freelancer mag alleen status (beperkte set) en afvinkstatus van checklistitems wijzigen.
create or replace function public.crew_update_task(p_task uuid, p_status public.task_status, p_checklist_done jsonb default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_fid uuid := app_private.my_freelancer_id();
  v_task public.tasks%rowtype;
  v_new jsonb;
begin
  select * into v_task from public.tasks where id = p_task;
  if v_fid is null or v_task.id is null or v_task.freelancer_id is distinct from v_fid
     or not v_task.shared_with_freelancer or not app_private.crew_has_project(v_task.project_id) then
    raise exception 'Geen toegang tot deze taak' using errcode = '42501';
  end if;
  if p_status not in ('todo', 'bezig', 'wacht_extern', 'klaar') then
    raise exception 'Deze status kan een freelancer niet instellen' using errcode = '42501';
  end if;
  v_new := v_task.checklist;
  if p_checklist_done is not null then
    if jsonb_typeof(p_checklist_done) <> 'object' then
      raise exception 'Ongeldige checklist';
    end if;
    -- Alleen het veld 'done' van bestaande items wordt aangepast; teksten blijven ongewijzigd.
    select coalesce(jsonb_agg(
             case when p_checklist_done ? (item ->> 'id')
                  then jsonb_set(item, '{done}', to_jsonb((p_checklist_done ->> (item ->> 'id'))::boolean))
                  else item end order by ord), '[]'::jsonb)
      into v_new
      from jsonb_array_elements(v_task.checklist) with ordinality as x(item, ord);
  end if;
  update public.tasks set status = p_status, checklist = v_new where id = p_task;
end;
$$;

create or replace function public.crew_add_comment(p_task uuid, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_fid uuid := app_private.my_freelancer_id();
  v_task public.tasks%rowtype;
begin
  select * into v_task from public.tasks where id = p_task;
  if v_fid is null or v_task.id is null or v_task.freelancer_id is distinct from v_fid
     or not v_task.shared_with_freelancer or not app_private.crew_has_project(v_task.project_id) then
    raise exception 'Geen toegang tot deze taak' using errcode = '42501';
  end if;
  insert into public.task_comments (task_id, author_id, body, visible_to_crew)
  values (p_task, auth.uid(), p_body, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Activiteit (audit). Volgt de zichtbaarheid van de brongegevens.
-- ---------------------------------------------------------------------------
create or replace function app_private.log(
  p_project uuid, p_entity text, p_entity_id uuid, p_action text, p_summary text, p_visibility text default 'staff'
) returns void
language sql security definer set search_path = ''
as $$
  insert into public.activities (project_id, actor_id, entity_type, entity_id, action, summary, visibility)
  values (p_project, (select auth.uid()), p_entity, p_entity_id, p_action, p_summary, p_visibility)
$$;

create or replace function app_private.audit_projects()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app_private.log(new.id, 'project', new.id, 'create', 'Project aangemaakt: ' || new.name);
  elsif tg_op = 'UPDATE' then
    if new.phase is distinct from old.phase then
      perform app_private.log(new.id, 'project', new.id, 'phase', 'Fase gewijzigd: ' ||
        app_private.phase_label(old.phase) || ' → ' || app_private.phase_label(new.phase));
    end if;
    if new.archived_at is distinct from old.archived_at then
      perform app_private.log(new.id, 'project', new.id, 'archive',
        case when new.archived_at is null then 'Project uit archief gehaald' else 'Project gearchiveerd' end);
    end if;
    if new.next_action_task_id is distinct from old.next_action_task_id
       or new.next_action_text is distinct from old.next_action_text
       or new.next_action_date is distinct from old.next_action_date then
      perform app_private.log(new.id, 'project', new.id, 'next_action', 'Eerstvolgende actie gewijzigd');
    end if;
    if new.deadline is distinct from old.deadline then
      perform app_private.log(new.id, 'project', new.id, 'deadline', 'Projectdeadline gewijzigd naar ' ||
        coalesce(to_char(new.deadline, 'DD-MM-YYYY'), 'geen'));
    end if;
  end if;
  return null;
end;
$$;
create trigger audit_projects after insert or update on public.projects
  for each row execute function app_private.audit_projects();

create or replace function app_private.audit_tasks()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.template_task_id is null then
    perform app_private.log(new.project_id, 'task', new.id, 'create', 'Taak toegevoegd: ' || new.title);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform app_private.log(new.project_id, 'task', new.id, 'status',
      'Taak "' || new.title || '": ' || app_private.status_label(new.status));
  elsif tg_op = 'UPDATE' and (new.assignee_id is distinct from old.assignee_id or new.due_date is distinct from old.due_date) then
    perform app_private.log(new.project_id, 'task', new.id, 'update', 'Taak bijgewerkt: ' || new.title);
  elsif tg_op = 'DELETE' then
    perform app_private.log(old.project_id, 'task', old.id, 'delete', 'Taak verwijderd: ' || old.title);
  end if;
  return null;
end;
$$;
create trigger audit_tasks after insert or update or delete on public.tasks
  for each row execute function app_private.audit_tasks();

create or replace function app_private.audit_generic()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_project uuid;
  v_label text := tg_argv[0];
  v_vis text := coalesce(tg_argv[1], 'staff');
  v_action text := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
  v_verb text := case tg_op when 'INSERT' then 'toegevoegd' when 'UPDATE' then 'bijgewerkt' else 'verwijderd' end;
  v_json jsonb;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  v_json := to_jsonb(r);
  v_project := (v_json ->> 'project_id')::uuid;
  if v_project is null and v_json ? 'deliverable_id' then
    select project_id into v_project from public.deliverables where id = (v_json ->> 'deliverable_id')::uuid;
  end if;
  if v_project is null and v_json ? 'invoice_id' then
    select project_id into v_project from finance.invoices where id = (v_json ->> 'invoice_id')::uuid;
  end if;
  -- Bewust geen bedragen of payloads in de samenvatting.
  perform app_private.log(v_project, tg_table_name, (v_json ->> 'id')::uuid, v_action, v_label || ' ' || v_verb, v_vis);
  return null;
end;
$$;

create trigger audit_shoot_days after insert or update or delete on public.shoot_days
  for each row execute function app_private.audit_generic('Draaidag');
create trigger audit_bookings after insert or update or delete on public.bookings
  for each row execute function app_private.audit_generic('Crewboeking');
create trigger audit_deliverables after insert or update or delete on public.deliverables
  for each row execute function app_private.audit_generic('Deliverable');
create trigger audit_versions after insert or delete on public.deliverable_versions
  for each row execute function app_private.audit_generic('Videoversie');
create trigger audit_feedback after insert or update on public.feedback_rounds
  for each row execute function app_private.audit_generic('Feedbackronde');
create trigger audit_documents after insert or delete on public.documents
  for each row execute function app_private.audit_generic('Document');
create trigger audit_portal_access after insert or update on public.portal_access
  for each row execute function app_private.audit_generic('Portaaltoegang', 'owner');
create trigger audit_portal_snapshots after insert or update or delete on public.portal_snapshots
  for each row execute function app_private.audit_generic('Klantpublicatie', 'owner');
create trigger audit_fin_project after update on finance.project_finances
  for each row execute function app_private.audit_generic('Financiële projectgegevens', 'owner');
create trigger audit_fin_invoices after insert or update or delete on finance.invoices
  for each row execute function app_private.audit_generic('Factuur', 'owner');
create trigger audit_fin_payments after insert or update or delete on finance.payments
  for each row execute function app_private.audit_generic('Betaling', 'owner');
create trigger audit_fin_costs after insert or update or delete on finance.costs
  for each row execute function app_private.audit_generic('Kostenpost', 'owner');
create trigger audit_fin_extra after insert or update or delete on finance.extra_work
  for each row execute function app_private.audit_generic('Meerwerk', 'owner');

-- ---------------------------------------------------------------------------
-- Automatisering: afgeronde volgende actie => melding om een nieuwe te kiezen
-- ---------------------------------------------------------------------------
create or replace function app_private.on_task_completed()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  p record;
  u uuid;
begin
  if new.status in ('klaar', 'nvt') and old.status not in ('klaar', 'nvt') then
    for p in select id, name from public.projects where next_action_task_id = new.id loop
      update public.projects set next_action_needs_update = true where id = p.id;
      for u in select app_private.project_recipients(p.id) loop
        perform app_private.notify(u, 'next_action_done', 'Kies een nieuwe volgende actie',
          'De volgende actie "' || new.title || '" van ' || p.name || ' is afgerond.',
          '/projecten/' || p.id, p.id, 'next-action-done:' || new.id || ':' || p.id);
      end loop;
    end loop;
  end if;
  return null;
end;
$$;
create trigger tasks_completed after update of status on public.tasks
  for each row execute function app_private.on_task_completed();

-- ---------------------------------------------------------------------------
-- Persistente jobtabel (retries, foutregistratie, deduplicatie)
-- ---------------------------------------------------------------------------
create table app_private.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_pending_idx on app_private.jobs (run_at) where status in ('pending', 'running');

create or replace function public.enqueue_job(p_kind text, p_payload jsonb, p_dedupe text, p_run_at timestamptz default now())
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app_private.jobs (kind, payload, dedupe_key, run_at)
  values (p_kind, coalesce(p_payload, '{}'::jsonb), p_dedupe, p_run_at)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.claim_jobs(p_worker text, p_limit integer default 10)
returns setof app_private.jobs
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  update app_private.jobs j
     set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
   where j.id in (
     select id from app_private.jobs
      where (status = 'pending' and run_at <= now())
         or (status = 'running' and locked_at < now() - interval '15 minutes')
      order by run_at
      limit p_limit
      for update skip locked)
  returning j.*;
end;
$$;

create or replace function public.complete_job(p_id uuid, p_result jsonb)
returns void language sql security definer set search_path = ''
as $$
  update app_private.jobs set status = 'done', result = p_result, finished_at = now(), locked_at = null, last_error = null
   where id = p_id
$$;

create or replace function public.fail_job(p_id uuid, p_error text)
returns void language sql security definer set search_path = ''
as $$
  update app_private.jobs
     set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
         run_at = now() + make_interval(mins => power(2, least(attempts, 8))::int),
         last_error = left(p_error, 2000), locked_at = null,
         finished_at = case when attempts >= max_attempts then now() end
   where id = p_id
$$;

-- Overzicht voor de eigenaar (zonder payloads).
create or replace function public.job_overview(p_limit integer default 30)
returns table (id uuid, kind text, status text, attempts integer, run_at timestamptz,
               finished_at timestamptz, last_error text, result jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_owner() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  return query select j.id, j.kind, j.status, j.attempts, j.run_at, j.finished_at, j.last_error, j.result, j.created_at
                 from app_private.jobs j order by j.created_at desc limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Signaleringen (idempotent dankzij dedupe-sleutels per gebeurtenis en datum)
-- ---------------------------------------------------------------------------
create or replace function public.run_signal_scan(p_today date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  u uuid;
  c_overdue int := 0; c_soon int := 0; c_follow int := 0; c_next int := 0; c_crew int := 0;
  c_prep int := 0; c_backup int := 0; c_review int := 0; c_invoice int := 0; c_eval int := 0;
begin
  -- Achterstallige, niet-optionele taken
  for r in
    select t.id, t.title, t.due_date, t.project_id, p.name pname, coalesce(t.assignee_id, p.lead_id) who
      from public.tasks t join public.projects p on p.id = t.project_id
     where t.status not in ('klaar', 'nvt') and t.due_date < p_today and not t.optional
       and p.archived_at is null and p.phase not in ('afgerond', 'verloren')
  loop
    for u in select r.who union select app_private.owner_ids() where r.who is null loop
      c_overdue := c_overdue + app_private.notify(u, 'task_overdue', 'Achterstallig: ' || r.title,
        r.pname || ' — deadline was ' || to_char(r.due_date, 'DD-MM'), '/projecten/' || r.project_id || '/taken',
        r.project_id, 'overdue:' || r.id || ':' || r.due_date);
    end loop;
  end loop;

  -- Deadlines binnen twee dagen
  for r in
    select t.id, t.title, t.due_date, t.project_id, p.name pname, coalesce(t.assignee_id, p.lead_id) who
      from public.tasks t join public.projects p on p.id = t.project_id
     where t.status not in ('klaar', 'nvt') and t.due_date between p_today and p_today + 2
       and p.archived_at is null and p.phase not in ('afgerond', 'verloren')
  loop
    c_soon := c_soon + app_private.notify(r.who, 'task_due_soon', 'Deadline nadert: ' || r.title,
      r.pname || ' — ' || to_char(r.due_date, 'DD-MM'), '/projecten/' || r.project_id || '/taken',
      r.project_id, 'due-soon:' || r.id || ':' || r.due_date);
  end loop;

  -- Wachtende taken met verstreken opvolgdatum
  for r in
    select t.id, t.title, t.follow_up_date, t.project_id, t.status, p.name pname, coalesce(t.assignee_id, p.lead_id) who
      from public.tasks t join public.projects p on p.id = t.project_id
     where t.status in ('wacht_klant', 'wacht_extern', 'geblokkeerd') and t.follow_up_date <= p_today
       and p.archived_at is null
  loop
    c_follow := c_follow + app_private.notify(r.who, 'waiting_followup', 'Opvolgen: ' || r.title,
      r.pname || ' — ' || app_private.status_label(r.status), '/projecten/' || r.project_id || '/taken',
      r.project_id, 'followup:' || r.id || ':' || r.follow_up_date);
  end loop;

  -- Volgende actie op of over datum
  for r in
    select p.id, p.name, p.next_action_date, coalesce(p.next_action_assignee_id, p.lead_id) who
      from public.projects p
     where p.next_action_date <= p_today and p.archived_at is null and p.phase not in ('afgerond', 'verloren')
       and (p.next_action_task_id is null or exists (
            select 1 from public.tasks t where t.id = p.next_action_task_id and t.status not in ('klaar', 'nvt')))
  loop
    c_next := c_next + app_private.notify(r.who, 'next_action_due', 'Volgende actie vandaag of verlopen',
      r.name, '/projecten/' || r.id, r.id, 'next-action-due:' || r.id || ':' || r.next_action_date);
  end loop;

  -- Naderende draaidag (7 dagen) met onbevestigde crew
  for r in
    select sd.id, sd.shoot_date, sd.project_id, p.name pname,
           (select count(*) from public.booking_shoot_days bsd join public.bookings b on b.id = bsd.booking_id
             where bsd.shoot_day_id = sd.id and b.status in ('benaderen', 'aangevraagd', 'optie')) open_count,
           (select count(*) from public.booking_shoot_days bsd join public.bookings b on b.id = bsd.booking_id
             where bsd.shoot_day_id = sd.id and b.status = 'bevestigd') confirmed_count
      from public.shoot_days sd join public.projects p on p.id = sd.project_id
     where sd.shoot_date between p_today and p_today + 7 and p.archived_at is null
       and p.phase not in ('afgerond', 'verloren')
  loop
    if r.open_count > 0 or r.confirmed_count = 0 then
      for u in select app_private.project_recipients(r.project_id) loop
        c_crew := c_crew + app_private.notify(u, 'crew_unconfirmed', 'Crew nog niet bevestigd',
          r.pname || ' — draaidag ' || to_char(r.shoot_date, 'DD-MM'), '/projecten/' || r.project_id || '/productie',
          r.project_id, 'crew:' || r.id || ':' || r.shoot_date);
      end loop;
    end if;
  end loop;

  -- Naderende draaidag (3 dagen) met ontbrekende voorbereiding
  for r in
    select sd.id, sd.shoot_date, sd.project_id, p.name pname, sd.callsheet_url,
           (select count(*) from public.tasks t
             where t.project_id = sd.project_id and t.phase = 'preproductie' and not t.optional
               and t.status not in ('klaar', 'nvt')) open_prep
      from public.shoot_days sd join public.projects p on p.id = sd.project_id
     where sd.shoot_date between p_today and p_today + 3 and p.archived_at is null
       and p.phase not in ('afgerond', 'verloren')
  loop
    if r.callsheet_url is null or r.open_prep > 0 then
      for u in select app_private.project_recipients(r.project_id) loop
        c_prep := c_prep + app_private.notify(u, 'prep_missing', 'Voorbereiding draaidag onvolledig',
          r.pname || ' — ' || to_char(r.shoot_date, 'DD-MM') || ': ' ||
          concat_ws(', ', case when r.callsheet_url is null then 'callsheet ontbreekt' end,
                          case when r.open_prep > 0 then r.open_prep || ' open pre-productietaken' end),
          '/projecten/' || r.project_id || '/productie', r.project_id, 'prep:' || r.id || ':' || r.shoot_date);
      end loop;
    end if;
  end loop;

  -- Back-upcontrole niet bevestigd na een draaidag
  for r in
    select t.id, t.title, t.project_id, p.name pname, sd.shoot_date, coalesce(t.assignee_id, p.lead_id) who
      from public.tasks t
      join public.shoot_days sd on sd.id = t.shoot_day_id
      join public.projects p on p.id = t.project_id
     where t.signal_key = 'backup_verified' and t.status not in ('klaar', 'nvt')
       and sd.shoot_date < p_today and p.archived_at is null
  loop
    for u in select r.who union select app_private.owner_ids() loop
      c_backup := c_backup + app_private.notify(u, 'backup_unverified', 'Back-upcontrole niet bevestigd',
        r.pname || ' — draaidag ' || to_char(r.shoot_date, 'DD-MM') || '. Verwijder geen materiaal.',
        '/projecten/' || r.project_id || '/productie', r.project_id, 'backup:' || r.id);
    end loop;
  end loop;

  -- Reviews die opvolging nodig hebben
  for r in
    select fr.id, fr.round_number, fr.status, d.name dname, d.project_id, p.name pname, p.lead_id,
           coalesce(fr.feedback_due, fr.requested_on + 3) due
      from public.feedback_rounds fr
      join public.deliverables d on d.id = fr.deliverable_id
      join public.projects p on p.id = d.project_id
     where p.archived_at is null and (
           (fr.status = 'wacht_op_feedback' and coalesce(fr.feedback_due, fr.requested_on + 3) < p_today)
        or (fr.status = 'feedback_ontvangen' and fr.received_on <= p_today - 2))
  loop
    for u in select app_private.project_recipients(r.project_id) loop
      c_review := c_review + app_private.notify(u, 'review_followup',
        case when r.status = 'wacht_op_feedback' then 'Feedback klant uitgebleven' else 'Ontvangen feedback nog niet verwerkt' end,
        r.pname || ' — ' || r.dname || ', ronde ' || r.round_number,
        '/projecten/' || r.project_id || '/deliverables', r.project_id,
        'review:' || r.id || ':' || r.status || ':' || coalesce(r.due::text, ''));
    end loop;
  end loop;

  -- Facturen die opvolging nodig hebben: uitsluitend eigenaren
  for r in
    select i.id, i.invoice_number, i.due_on, i.project_id, p.name pname
      from finance.invoices i join public.projects p on p.id = i.project_id
     where i.status = 'verstuurd' and i.due_on < p_today
       and (select coalesce(sum(pm.amount_cents), 0) from finance.payments pm where pm.invoice_id = i.id)
           < i.amount_excl_cents + i.vat_cents
  loop
    for u in select app_private.owner_ids() loop
      c_invoice := c_invoice + app_private.notify(u, 'invoice_overdue', 'Factuur ' || r.invoice_number || ' vervallen',
        r.pname, '/financien', r.project_id, 'invoice:' || r.id || ':' || r.due_on);
    end loop;
  end loop;
  for r in
    select f.id, f.description, f.due_on, f.project_id from finance.followups f
     where f.done_at is null and f.due_on <= p_today
  loop
    for u in select app_private.owner_ids() loop
      c_invoice := c_invoice + app_private.notify(u, 'finance_followup', 'Financiële opvolging',
        r.description, '/financien', r.project_id, 'fin-followup:' || r.id || ':' || r.due_on);
    end loop;
  end loop;

  -- Evaluatieherinnering na oplevering
  for r in
    select p.id, p.name from public.projects p
     where p.phase in ('oplevering', 'afronding', 'evaluatie') and p.archived_at is null
       and p.phase_changed_at::date <= p_today - 14
       and exists (select 1 from public.tasks t where t.project_id = p.id and t.signal_key = 'evaluation'
                     and t.status not in ('klaar', 'nvt'))
  loop
    for u in select app_private.project_recipients(r.id) loop
      c_eval := c_eval + app_private.notify(u, 'evaluation_reminder', 'Tijd voor evaluatie', r.name,
        '/projecten/' || r.id || '/taken', r.id, 'evaluation:' || r.id);
    end loop;
  end loop;

  return jsonb_build_object('overdue', c_overdue, 'due_soon', c_soon, 'followup', c_follow, 'next_action', c_next,
    'crew', c_crew, 'prep', c_prep, 'backup', c_backup, 'review', c_review, 'finance', c_invoice, 'evaluation', c_eval);
end;
$$;

-- ---------------------------------------------------------------------------
-- Offerte-integratie: idempotente verwerking van 'quote.created' en 'quote.accepted'
-- ---------------------------------------------------------------------------
create or replace function public.process_quote_event(
  p_source text, p_event_id text, p_type text, p_external_id text, p_data jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_event uuid;
  v_quote public.integration_quotes%rowtype;
  v_project uuid;
  v_owner uuid;
  v_result text;
  u uuid;
begin
  if p_type not in ('quote.created', 'quote.accepted') then
    raise exception 'Onbekend eventtype %', p_type;
  end if;
  -- Serialiseer gelijktijdige events voor dezelfde offerte.
  perform pg_advisory_xact_lock(hashtextextended(p_source || ':' || p_external_id, 0));

  insert into public.integration_events (source, event_id, event_type, external_id)
  values (p_source, p_event_id, p_type, p_external_id)
  on conflict (source, event_id) do nothing
  returning id into v_event;
  if v_event is null then
    select project_id into v_project from public.integration_quotes where source = p_source and external_id = p_external_id;
    return jsonb_build_object('status', 'duplicate_event', 'project_id', v_project);
  end if;

  select * into v_quote from public.integration_quotes where source = p_source and external_id = p_external_id;
  if v_quote.id is null then
    select user_id into v_owner from public.user_roles where role = 'owner' and active order by created_at limit 1;
    v_project := app_private.create_project_core(jsonb_build_object(
      'name', coalesce(nullif(p_data ->> 'title', ''), 'Offerte ' || p_external_id),
      'new_client_name', nullif(p_data ->> 'client_name', ''),
      'lead_id', v_owner, 'phase', 'deal'), v_owner);
    insert into public.integration_quotes (source, external_id, project_id)
    values (p_source, p_external_id, v_project)
    returning * into v_quote;
    if (p_data ->> 'amount_cents') ~ '^\d+$' then
      update finance.project_finances
         set quote_amount_cents = (p_data ->> 'amount_cents')::bigint, quote_reference = p_source || ':' || p_external_id
       where project_id = v_project;
    end if;
    v_result := 'project_created';
  else
    v_project := v_quote.project_id;
    v_result := 'project_exists';
  end if;

  if p_type = 'quote.accepted' and v_quote.status <> 'accepted' then
    update public.integration_quotes set status = 'accepted', accepted_at = now() where id = v_quote.id;
    perform app_private.log(v_project, 'integration', v_quote.id, 'quote_accepted', 'Offerte akkoord ontvangen via ' || p_source);
    -- Fase wordt niet automatisch gewijzigd: alleen een voorstel aan de eigenaar.
    for u in select app_private.owner_ids() loop
      perform app_private.notify(u, 'quote_accepted', 'Offerte akkoord — fase bijwerken?',
        'Overweeg de fase te wijzigen naar Strategie & concept of Pre-productie.',
        '/projecten/' || v_project, v_project, 'quote-accepted:' || v_quote.id);
    end loop;
    v_result := v_result || '+accepted';
  end if;

  update public.integration_events set processed_at = now(), result = v_result where id = v_event;
  return jsonb_build_object('status', v_result, 'project_id', v_project);
end;
$$;
