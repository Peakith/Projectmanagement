-- Toegangsrechten: beperkte grants + Row Level Security.
-- Uitgangspunt: alles dicht, daarna per rol expliciet open.
--   eigenaar   : alles, inclusief schema finance
--   medewerker : operationele tabellen, geen finance, geen rollen/templates/portaalbeheer
--   freelancer : geen basistabellen; alleen via crew_* functies + gedeelde documenten
--   klant      : alleen gepubliceerde portaalmomentopnames met actieve toegang

-- ---------------------------------------------------------------------------
-- 1. Alles dichtzetten (Supabase geeft standaard ruime rechten in schema public)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

revoke all on all tables in schema finance from public, anon, authenticated;
revoke execute on all functions in schema finance from public, anon, authenticated;
revoke execute on all functions in schema app_private from public, anon, authenticated;
revoke all on all tables in schema app_private from public, anon, authenticated;

grant usage on schema app_private to authenticated, service_role;
grant usage on schema finance to authenticated, service_role;

-- Hulpfuncties die in policies, constraints en invoker-functies nodig zijn.
grant execute on function
  app_private.is_safe_url(text), app_private.current_app_role(), app_private.is_owner(), app_private.is_staff(),
  app_private.my_freelancer_id(), app_private.crew_has_project(uuid),
  app_private.anchor_date(uuid, public.date_anchor, uuid)
to authenticated, service_role;

-- service_role (alleen server-side scripts/jobs) mag alles.
grant all on all tables in schema public to service_role;
grant all on all tables in schema finance to service_role;
grant all on all tables in schema app_private to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema app_private to service_role;
grant execute on all functions in schema finance to service_role;

-- ---------------------------------------------------------------------------
-- 2. RLS aan op alle tabellen
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('public', 'finance', 'app_private') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Grants + policies per tabel
-- ---------------------------------------------------------------------------

-- Merken
grant select, insert, update on public.brands to authenticated;
create policy brands_read on public.brands for select to authenticated using (true);
create policy brands_owner_write on public.brands for insert to authenticated with check ((select app_private.is_owner()));
create policy brands_owner_update on public.brands for update to authenticated using ((select app_private.is_owner()));

-- Profielen: eigen profiel; intern team ziet iedereen; externen zien alleen interne teamleden.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select app_private.is_staff())
  or exists (select 1 from public.user_roles ur where ur.user_id = profiles.id and ur.active and ur.role in ('owner', 'employee'))
);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Rollen: alleen lezen (eigen rij; eigenaar alles). Schrijven uitsluitend via admin_* functies.
grant select on public.user_roles to authenticated;
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_owner()));

-- Operationele tabellen: intern team (eigenaar + medewerker)
do $$
declare t text;
begin
  foreach t in array array['clients', 'contacts', 'project_contacts', 'shoot_days', 'bookings', 'booking_shoot_days',
                           'deliverables', 'deliverable_versions', 'feedback_rounds', 'deliverable_links',
                           'tasks', 'task_dependencies', 'task_comments'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select app_private.is_staff()))', t || '_staff_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select app_private.is_staff()))', t || '_staff_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select app_private.is_staff())) with check ((select app_private.is_staff()))', t || '_staff_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select app_private.is_staff()))', t || '_staff_delete', t);
  end loop;
end $$;

-- Projecten: aanmaken via create_project(); verwijderen alleen door de eigenaar.
grant select, update, delete on public.projects to authenticated;
create policy projects_staff_select on public.projects for select to authenticated using ((select app_private.is_staff()));
create policy projects_staff_update on public.projects for update to authenticated
  using ((select app_private.is_staff())) with check ((select app_private.is_staff()));
create policy projects_owner_delete on public.projects for delete to authenticated using ((select app_private.is_owner()));

-- Freelancerregister: intern team; accountkoppeling (user_id) alleen via admin_link_freelancer().
grant select, delete on public.freelancers to authenticated;
grant insert (name, specialisms, email, phone, city, notes, availability, availability_note, active) on public.freelancers to authenticated;
grant update (name, specialisms, email, phone, city, notes, availability, availability_note, active) on public.freelancers to authenticated;
create policy freelancers_staff_select on public.freelancers for select to authenticated using ((select app_private.is_staff()));
create policy freelancers_staff_insert on public.freelancers for insert to authenticated with check ((select app_private.is_staff()));
create policy freelancers_staff_update on public.freelancers for update to authenticated
  using ((select app_private.is_staff())) with check ((select app_private.is_staff()));
create policy freelancers_owner_delete on public.freelancers for delete to authenticated using ((select app_private.is_owner()));

-- Templates: intern team leest; alleen eigenaar beheert.
grant select, insert, update, delete on public.templates, public.template_versions, public.template_tasks to authenticated;
do $$
declare t text;
begin
  foreach t in array array['templates', 'template_versions', 'template_tasks'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select app_private.is_staff()))', t || '_staff_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select app_private.is_owner()))', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select app_private.is_owner())) with check ((select app_private.is_owner()))', t || '_owner_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select app_private.is_owner()))', t || '_owner_delete', t);
  end loop;
end $$;

-- Gepubliceerde templateversies zijn onveranderlijk (bestaande projecten veranderen nooit ongemerkt).
create or replace function app_private.protect_published_template()
returns trigger language plpgsql set search_path = ''
as $$
declare v_version uuid;
begin
  if tg_table_name = 'template_tasks' then
    v_version := coalesce(new.template_version_id, old.template_version_id);
    if exists (select 1 from public.template_versions where id = v_version and published_at is not null)
       or (tg_op = 'UPDATE' and exists (select 1 from public.template_versions where id = old.template_version_id and published_at is not null)) then
      raise exception 'Een gepubliceerde templateversie kan niet meer worden gewijzigd; maak een nieuwe versie';
    end if;
  elsif tg_table_name = 'template_versions' and tg_op in ('UPDATE', 'DELETE') then
    if old.published_at is not null then
      raise exception 'Een gepubliceerde templateversie kan niet meer worden gewijzigd';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger template_tasks_protect before insert or update or delete on public.template_tasks
  for each row execute function app_private.protect_published_template();
create trigger template_versions_protect before update or delete on public.template_versions
  for each row execute function app_private.protect_published_template();

-- Documenten: intern team; freelancers alleen documenten die expliciet met crew zijn gedeeld.
grant select, insert, update, delete on public.documents, public.document_files to authenticated;
create policy documents_staff_all on public.documents for all to authenticated
  using ((select app_private.is_staff())) with check ((select app_private.is_staff()));
create policy documents_crew_select on public.documents for select to authenticated
  using (visibility = 'crew' and app_private.crew_has_project(project_id));
create policy document_files_staff_all on public.document_files for all to authenticated
  using ((select app_private.is_staff())) with check ((select app_private.is_staff()));
create policy document_files_crew_select on public.document_files for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and d.visibility = 'crew'
                   and app_private.crew_has_project(d.project_id)));

-- Activiteit: volgt de zichtbaarheid van de brongegevens; alleen via triggers geschreven.
grant select on public.activities to authenticated;
create policy activities_read on public.activities for select to authenticated using (
  (visibility = 'staff' and (select app_private.is_staff())) or (select app_private.is_owner())
);

-- Meldingen: alleen eigen meldingen; alleen read_at mag worden aangepast.
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- Interfacevoorkeuren: alleen eigen.
grant select, insert, update, delete on public.user_preferences to authenticated;
create policy prefs_own on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Klantportaal
grant select, insert, update on public.portal_access to authenticated;
create policy portal_access_owner on public.portal_access for all to authenticated
  using ((select app_private.is_owner())) with check ((select app_private.is_owner()));
create policy portal_access_client_own on public.portal_access for select to authenticated
  using (user_id = (select auth.uid()) and revoked_at is null and (select app_private.current_app_role()) = 'client');

grant select, insert, update, delete on public.portal_drafts to authenticated;
create policy portal_drafts_owner on public.portal_drafts for all to authenticated
  using ((select app_private.is_owner())) with check ((select app_private.is_owner()));

grant select, insert, update, delete on public.portal_snapshots to authenticated;
create policy portal_snapshots_owner on public.portal_snapshots for all to authenticated
  using ((select app_private.is_owner())) with check ((select app_private.is_owner()));
create policy portal_snapshots_client on public.portal_snapshots for select to authenticated using (
  (select app_private.current_app_role()) = 'client'
  and exists (select 1 from public.portal_access pa
               where pa.project_id = portal_snapshots.project_id and pa.user_id = (select auth.uid()) and pa.revoked_at is null)
);

-- Integratie: intern team ziet de koppeling; events alleen eigenaar. Schrijven alleen via service.
grant select on public.integration_quotes, public.integration_events to authenticated;
create policy integration_quotes_staff on public.integration_quotes for select to authenticated using ((select app_private.is_staff()));
create policy integration_events_owner on public.integration_events for select to authenticated using ((select app_private.is_owner()));

-- Financiën: uitsluitend eigenaar
do $$
declare t text;
begin
  foreach t in array array['project_finances', 'extra_work', 'costs', 'booking_agreements', 'invoices', 'payments', 'followups', 'documents'] loop
    execute format('grant select, insert, update, delete on finance.%I to authenticated', t);
    execute format('create policy %I on finance.%I for all to authenticated using ((select app_private.is_owner())) with check ((select app_private.is_owner()))', t || '_owner_only', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Functies die ingelogde gebruikers mogen aanroepen (elk controleert zelf de rol)
-- ---------------------------------------------------------------------------
grant execute on function
  public.create_project(jsonb),
  public.add_shoot_day(uuid, date, time, time, text, text, boolean),
  public.plan_proposal(uuid),
  public.apply_plan_proposal(uuid, uuid[]),
  public.booking_overlaps(),
  public.admin_set_role(uuid, public.app_role),
  public.admin_set_active(uuid, boolean),
  public.admin_link_freelancer(uuid, uuid),
  public.admin_list_users(),
  public.crew_projects(),
  public.crew_project(uuid),
  public.crew_update_task(uuid, public.task_status, jsonb),
  public.crew_add_comment(uuid, text),
  public.job_overview(integer)
to authenticated;
-- enqueue_job, claim_jobs, complete_job, fail_job, run_signal_scan en process_quote_event
-- blijven uitsluitend voor service_role.

-- ---------------------------------------------------------------------------
-- 5. Extra feedbackronde (buiten scope) alleen door de eigenaar te openen
-- ---------------------------------------------------------------------------
create or replace function app_private.check_feedback_round()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_included integer;
begin
  select included_rounds into v_included from public.deliverables where id = new.deliverable_id;
  if new.round_number > v_included and not new.is_extra then
    raise exception 'Ronde % valt buiten de % inbegrepen feedbackrondes; registreer eerst extra werk met reden en goedkeuring', new.round_number, v_included
      using errcode = 'P0001';
  end if;
  if new.round_number <= v_included and new.is_extra then
    raise exception 'Ronde % is een inbegrepen ronde en kan niet als extra worden gemarkeerd', new.round_number;
  end if;
  if new.is_extra and (tg_op = 'INSERT' or not old.is_extra)
     and (select auth.uid()) is not null and not app_private.is_owner() then
    raise exception 'Alleen de eigenaar kan een extra feedbackronde openen' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.round_number > 1 and not exists (
    select 1 from public.feedback_rounds where deliverable_id = new.deliverable_id and round_number = new.round_number - 1
  ) then
    raise exception 'Feedbackrondes moeten op volgorde worden aangemaakt';
  end if;
  return new;
end;
$$;
