-- ============================================================================
-- Studio Brutaal — volledige database-installatie in één keer.
-- GEGENEREERD uit supabase/migrations/ door scripts/build-install-sql.sh; niet met de hand wijzigen.
--
-- Gebruik: Supabase → SQL Editor → New query → plak dit hele bestand → Run.
-- Alleen uitvoeren op een NIEUW (leeg) project. Alles gebeurt in één transactie:
-- bij een fout wordt niets half aangemaakt.
-- ============================================================================

begin;

-- >>> 20261008000100_core_schema.sql
-- Studio Brutaal — operationeel datamodel.
-- Financiële gegevens staan bewust NIET in dit schema maar in schema `finance`
-- (zie 20261008000200_finance.sql).

create schema if not exists app_private;
revoke all on schema app_private from public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('owner', 'employee', 'freelancer', 'client');

create type public.project_phase as enum (
  'deal', 'strategie', 'preproductie', 'productie', 'postproductie',
  'oplevering', 'afronding', 'evaluatie', 'afgerond', 'verloren'
);

create type public.task_status as enum (
  'todo', 'bezig', 'wacht_klant', 'wacht_extern', 'geblokkeerd', 'nvt', 'klaar'
);

create type public.priority as enum ('laag', 'normaal', 'hoog', 'urgent');

create type public.project_health as enum ('op_schema', 'aandacht', 'geblokkeerd');

create type public.booking_status as enum ('benaderen', 'aangevraagd', 'optie', 'bevestigd', 'geannuleerd');

create type public.availability_status as enum ('onbekend', 'beschikbaar', 'beperkt', 'niet_beschikbaar');

create type public.feedback_status as enum (
  'gepland', 'wacht_op_feedback', 'feedback_ontvangen', 'in_verwerking', 'verwerkt'
);

create type public.approval_source as enum ('vimeo', 'email', 'mondeling', 'anders');

create type public.doc_visibility as enum ('internal', 'crew');

create type public.date_anchor as enum ('none', 'project_start', 'project_deadline', 'shoot_day');

-- ---------------------------------------------------------------------------
-- Hulpfuncties
-- ---------------------------------------------------------------------------
create or replace function app_private.is_safe_url(u text)
returns boolean
language sql immutable
set search_path = ''
as $$
  -- Alleen http(s), geen spaties of besturingstekens; voorkomt javascript:/data: e.d.
  select u is null or (u ~* '^https?://[^\s/$.?#][^\s]*$' and length(u) <= 2000);
$$;

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Merken, profielen en rollen
-- ---------------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.brands (slug, name) values ('studio-brutaal', 'Studio Brutaal');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '' check (length(full_name) <= 120),
  created_at timestamptz not null default now()
);

-- Roltoekenning wordt uitsluitend server-side beheerd (eigenaar-RPC's of
-- service-scripts). Gebruikers kunnen deze tabel alleen lezen.
create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deactivated_at timestamptz
);

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do update set email = excluded.email;
  -- Let op: metadata wordt alleen voor de weergavenaam gebruikt, nooit voor rollen.
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function app_private.handle_new_user();

create or replace function app_private.current_app_role()
returns public.app_role
language sql stable
security definer
set search_path = ''
as $$
  select ur.role from public.user_roles ur
  where ur.user_id = (select auth.uid()) and ur.active
$$;

create or replace function app_private.is_owner()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(app_private.current_app_role() = 'owner', false) $$;

create or replace function app_private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(app_private.current_app_role() in ('owner', 'employee'), false) $$;

-- ---------------------------------------------------------------------------
-- Klanten en contacten
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
create unique index clients_name_unique on public.clients (lower(name));

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  role text not null default '',
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  created_at timestamptz not null default now()
);
create index contacts_client_idx on public.contacts (client_id);

-- ---------------------------------------------------------------------------
-- Templates (geversioneerd)
-- ---------------------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index templates_one_default on public.templates (is_default) where is_default;

create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  version integer not null check (version > 0),
  notes text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (template_id, version)
);

create table public.template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.template_versions (id) on delete cascade,
  phase public.project_phase not null,
  sort integer not null default 0,
  title text not null check (length(title) between 1 and 200),
  description text not null default '',
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  anchor public.date_anchor not null default 'none',
  offset_days integer not null default 0 check (offset_days between -365 and 365),
  priority public.priority not null default 'normaal',
  optional boolean not null default false,
  per_shoot_day boolean not null default false,
  -- Optionele sleutel waarmee automatiseringen een taak herkennen (bijv. back-upcontrole).
  signal_key text check (signal_key is null or signal_key ~ '^[a-z_]{1,40}$'),
  check (not per_shoot_day or anchor = 'shoot_day')
);
create index template_tasks_version_idx on public.template_tasks (template_version_id, phase, sort);

-- ---------------------------------------------------------------------------
-- Projecten
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  client_id uuid references public.clients (id) on delete restrict,
  brand_id uuid not null references public.brands (id),
  lead_id uuid references public.profiles (id) on delete set null,
  project_type text not null default '',
  briefing text not null default '',
  goal text not null default '',
  target_audience text not null default '',
  strategy text not null default '',
  concept text not null default '',
  crew_briefing text not null default '',
  start_date date,
  deadline date,
  phase public.project_phase not null default 'deal',
  phase_changed_at timestamptz not null default now(),
  priority public.priority not null default 'normaal',
  health public.project_health not null default 'op_schema',
  health_note text not null default '',
  next_action_task_id uuid,
  next_action_text text,
  next_action_assignee_id uuid references public.profiles (id) on delete set null,
  next_action_date date,
  next_action_needs_update boolean not null default false,
  follow_up_date date,
  template_version_id uuid references public.template_versions (id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  check (start_date is null or deadline is null or start_date <= deadline)
);
create index projects_phase_idx on public.projects (phase) where archived_at is null;
create index projects_client_idx on public.projects (client_id);
create trigger projects_updated_at before update on public.projects
  for each row execute function app_private.touch_updated_at();

create table public.project_contacts (
  project_id uuid not null references public.projects (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  primary key (project_id, contact_id)
);

-- ---------------------------------------------------------------------------
-- Draaidagen (één bron per draaidag)
-- ---------------------------------------------------------------------------
create table public.shoot_days (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  shoot_date date not null,
  start_time time,
  end_time time,
  location text not null default '',
  address text not null default '',
  schedule text not null default '',
  callsheet_url text check (app_private.is_safe_url(callsheet_url)),
  crew_notes text not null default '',
  internal_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, shoot_date)
);
create index shoot_days_date_idx on public.shoot_days (shoot_date);
create trigger shoot_days_updated_at before update on public.shoot_days
  for each row execute function app_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Freelancers (contactrecord, géén account) en boekingen
-- ---------------------------------------------------------------------------
create table public.freelancers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  specialisms text[] not null default '{}',
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  city text not null default '',
  notes text not null default '',
  availability public.availability_status not null default 'onbekend',
  availability_note text not null default '',
  -- Optionele, expliciete koppeling aan een account. Verleent op zichzelf geen
  -- toegang: daarvoor is ook een actieve rol 'freelancer' nodig.
  user_id uuid unique references auth.users (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  freelancer_id uuid not null references public.freelancers (id) on delete restrict,
  role text not null default '',
  work_description text not null default '',
  status public.booking_status not null default 'benaderen',
  internal_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_project_idx on public.bookings (project_id);
create index bookings_freelancer_idx on public.bookings (freelancer_id);
create trigger bookings_updated_at before update on public.bookings
  for each row execute function app_private.touch_updated_at();

create table public.booking_shoot_days (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  shoot_day_id uuid not null references public.shoot_days (id) on delete cascade,
  primary key (booking_id, shoot_day_id)
);
create index booking_shoot_days_day_idx on public.booking_shoot_days (shoot_day_id);

create or replace function app_private.check_booking_shoot_day()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select project_id from public.bookings where id = new.booking_id)
     is distinct from (select project_id from public.shoot_days where id = new.shoot_day_id) then
    raise exception 'Draaidag hoort niet bij hetzelfde project als de boeking';
  end if;
  return new;
end;
$$;
create trigger booking_shoot_days_same_project before insert or update on public.booking_shoot_days
  for each row execute function app_private.check_booking_shoot_day();

-- ---------------------------------------------------------------------------
-- Deliverables, versies, feedbackrondes en definitieve links
-- ---------------------------------------------------------------------------
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  goal text not null default '',
  scope text not null default '',
  planned_delivery_date date,
  formats text[] not null default '{}',
  included_rounds integer not null default 2 check (included_rounds between 0 and 10),
  approved_version_id uuid,
  approved_on date,
  approval_source public.approval_source,
  approval_reference text not null default '',
  approved_by uuid references auth.users (id) on delete set null,
  delivered_on date,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((approved_version_id is null) = (approved_on is null)),
  check (approved_version_id is null or approval_source is not null)
);
create index deliverables_project_idx on public.deliverables (project_id);
create trigger deliverables_updated_at before update on public.deliverables
  for each row execute function app_private.touch_updated_at();

create table public.deliverable_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  delivered_on date not null default current_date,
  review_url text check (app_private.is_safe_url(review_url)),
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (deliverable_id, version_number),
  unique (deliverable_id, id)
);

alter table public.deliverables
  add constraint deliverables_approved_version_fk
  foreign key (id, approved_version_id) references public.deliverable_versions (deliverable_id, id)
  deferrable initially deferred;

create table public.feedback_rounds (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables (id) on delete cascade,
  round_number integer not null check (round_number > 0),
  is_extra boolean not null default false,
  version_id uuid,
  status public.feedback_status not null default 'gepland',
  requested_on date,
  feedback_due date,
  received_on date,
  processed_on date,
  notes text not null default '',
  extra_reason text,
  extra_approved_by uuid references auth.users (id) on delete set null,
  extra_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deliverable_id, round_number),
  foreign key (deliverable_id, version_id) references public.deliverable_versions (deliverable_id, id),
  -- Een extra (niet-inbegrepen) ronde vereist altijd een reden en goedkeuring.
  check (not is_extra or (extra_reason is not null and length(extra_reason) > 0
                          and extra_approved_by is not null and extra_approved_at is not null))
);
create trigger feedback_rounds_updated_at before update on public.feedback_rounds
  for each row execute function app_private.touch_updated_at();

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
  if tg_op = 'INSERT' and new.round_number > 1 and not exists (
    select 1 from public.feedback_rounds where deliverable_id = new.deliverable_id and round_number = new.round_number - 1
  ) then
    raise exception 'Feedbackrondes moeten op volgorde worden aangemaakt';
  end if;
  return new;
end;
$$;
create trigger feedback_rounds_check before insert or update on public.feedback_rounds
  for each row execute function app_private.check_feedback_round();

create table public.deliverable_links (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables (id) on delete cascade,
  label text not null check (length(label) between 1 and 200),
  url text not null check (app_private.is_safe_url(url)),
  format text not null default '',
  is_final boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Taken
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_task_id uuid references public.tasks (id) on delete cascade,
  phase public.project_phase not null,
  sort integer not null default 0,
  title text not null check (length(title) between 1 and 300),
  description text not null default '',
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  status public.task_status not null default 'todo',
  priority public.priority not null default 'normaal',
  assignee_id uuid references public.profiles (id) on delete set null,
  freelancer_id uuid references public.freelancers (id) on delete set null,
  shared_with_freelancer boolean not null default false,
  due_date date,
  anchor public.date_anchor not null default 'none',
  offset_days integer not null default 0,
  optional boolean not null default false,
  waiting_since timestamptz,
  blocked_reason text,
  nvt_reason text,
  follow_up_date date,
  shoot_day_id uuid references public.shoot_days (id) on delete set null,
  deliverable_id uuid references public.deliverables (id) on delete set null,
  template_task_id uuid references public.template_tasks (id) on delete set null,
  signal_key text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (status <> 'geblokkeerd' or (blocked_reason is not null and length(blocked_reason) > 0)),
  check (status <> 'nvt' or (nvt_reason is not null and length(nvt_reason) > 0)),
  check (not shared_with_freelancer or freelancer_id is not null)
);
create index tasks_project_idx on public.tasks (project_id, phase, sort);
create index tasks_due_idx on public.tasks (due_date) where status not in ('klaar', 'nvt');
create index tasks_freelancer_idx on public.tasks (freelancer_id) where shared_with_freelancer;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function app_private.touch_updated_at();

alter table public.projects
  add constraint projects_next_action_task_fk
  foreign key (next_action_task_id) references public.tasks (id) on delete set null;

create table public.task_dependencies (
  task_id uuid not null references public.tasks (id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks (id) on delete cascade,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (length(body) between 1 and 4000),
  visible_to_crew boolean not null default false,
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

-- Taakregels: wacht-sinds, afronding, consistentie met project/draaidag/deliverable.
create or replace function app_private.task_rules()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status in ('wacht_klant', 'wacht_extern') then
    if tg_op = 'INSERT' or old.status is distinct from new.status or new.waiting_since is null then
      new.waiting_since := coalesce(case when tg_op = 'UPDATE' and old.status = new.status then old.waiting_since end, now());
    end if;
  else
    new.waiting_since := null;
  end if;
  if new.status <> 'geblokkeerd' then new.blocked_reason := null; end if;
  if new.status <> 'nvt' then new.nvt_reason := null; end if;
  if new.status = 'klaar' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  if new.shoot_day_id is not null and
     (select project_id from public.shoot_days where id = new.shoot_day_id) <> new.project_id then
    raise exception 'Draaidag hoort niet bij dit project';
  end if;
  if new.deliverable_id is not null and
     (select project_id from public.deliverables where id = new.deliverable_id) <> new.project_id then
    raise exception 'Deliverable hoort niet bij dit project';
  end if;
  if new.parent_task_id is not null and
     (select project_id from public.tasks where id = new.parent_task_id) <> new.project_id then
    raise exception 'Bovenliggende taak hoort niet bij dit project';
  end if;
  return new;
end;
$$;
create trigger tasks_rules before insert or update on public.tasks
  for each row execute function app_private.task_rules();

create or replace function app_private.project_rules()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.next_action_task_id is not null and
     (select project_id from public.tasks where id = new.next_action_task_id) is distinct from new.id then
    raise exception 'De volgende actie moet een taak van dit project zijn';
  end if;
  if tg_op = 'UPDATE' then
    if new.phase is distinct from old.phase then
      new.phase_changed_at := now();
    end if;
    if new.next_action_task_id is distinct from old.next_action_task_id
       or new.next_action_text is distinct from old.next_action_text then
      new.next_action_needs_update := false;
    end if;
  end if;
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;
create trigger projects_rules before insert or update on public.projects
  for each row execute function app_private.project_rules();

-- ---------------------------------------------------------------------------
-- Documenten en links (operationeel; financiële documenten staan in finance)
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  kind text not null check (kind in ('link', 'file')),
  url text check (app_private.is_safe_url(url)),
  file_name text,
  mime_type text,
  size_bytes integer check (size_bytes is null or size_bytes between 0 and 10485760),
  visibility public.doc_visibility not null default 'internal',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  check ((kind = 'link') = (url is not null)),
  check ((kind = 'file') = (file_name is not null))
);
create index documents_project_idx on public.documents (project_id);

-- Bestandsinhoud apart, zodat lijsten nooit de bytes meesturen.
create table public.document_files (
  document_id uuid primary key references public.documents (id) on delete cascade,
  content bytea not null check (octet_length(content) <= 10485760)
);

-- ---------------------------------------------------------------------------
-- Activiteit (audit), meldingen, voorkeuren
-- ---------------------------------------------------------------------------
create table public.activities (
  id bigint generated always as identity primary key,
  project_id uuid references public.projects (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text not null,
  visibility text not null default 'staff' check (visibility in ('staff', 'owner')),
  created_at timestamptz not null default now()
);
create index activities_project_idx on public.activities (project_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  project_id uuid references public.projects (id) on delete cascade,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table public.user_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_.-]{1,64}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  check (octet_length(value::text) <= 4000)
);

-- ---------------------------------------------------------------------------
-- Klantportaal: expliciete toegang, concept en gepubliceerde momentopname
-- ---------------------------------------------------------------------------
create table public.portal_access (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null
);
create unique index portal_access_active_unique on public.portal_access (project_id, user_id) where revoked_at is null;

create table public.portal_drafts (
  project_id uuid primary key references public.projects (id) on delete cascade,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.portal_snapshots (
  project_id uuid primary key references public.projects (id) on delete cascade,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Toekomstige offerte-integratie (idempotent via unieke constraints)
-- ---------------------------------------------------------------------------
create table public.integration_quotes (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source ~ '^[a-z0-9_-]{1,40}$'),
  external_id text not null check (length(external_id) between 1 and 200),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  status text not null default 'created' check (status in ('created', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (source, external_id)
);

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_id text not null,
  event_type text not null,
  external_id text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text,
  error text,
  unique (source, event_id)
);

-- >>> 20261008000200_finance.sql
-- Afgeschermde financiën: uitsluitend voor de eigenaar.
-- Eigen schema met eigen grants en RLS. Bedragen in integer eurocenten, exclusief btw
-- tenzij de kolomnaam anders zegt.

create schema if not exists finance;
revoke all on schema finance from public;

create table finance.project_finances (
  project_id uuid primary key references public.projects (id) on delete cascade,
  quote_amount_cents bigint check (quote_amount_cents is null or quote_amount_cents >= 0),
  quote_reference text not null default '',
  quote_sent_on date,
  vat_rate_percent numeric(5, 2) not null default 21 check (vat_rate_percent between 0 and 100),
  payment_terms text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table finance.extra_work (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  description text not null check (length(description) between 1 and 500),
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null default 'voorgesteld' check (status in ('voorgesteld', 'goedgekeurd', 'afgewezen')),
  approved_on date,
  feedback_round_id uuid references public.feedback_rounds (id) on delete set null,
  created_at timestamptz not null default now(),
  check (status <> 'goedgekeurd' or approved_on is not null)
);
create index extra_work_project_idx on finance.extra_work (project_id);

create table finance.costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('begroot', 'werkelijk')),
  category text not null default 'overig' check (category in ('freelancer', 'huur', 'reis', 'materiaal', 'licenties', 'overig')),
  description text not null check (length(description) between 1 and 500),
  supplier text not null default '',
  amount_cents bigint not null check (amount_cents >= 0),
  booking_id uuid references public.bookings (id) on delete set null,
  incurred_on date,
  created_at timestamptz not null default now()
);
create index costs_project_idx on finance.costs (project_id);

create table finance.booking_agreements (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  rate_cents bigint check (rate_cents is null or rate_cents >= 0),
  rate_unit text not null default 'dag' check (rate_unit in ('dag', 'halve_dag', 'uur', 'project')),
  agreed_total_cents bigint check (agreed_total_cents is null or agreed_total_cents >= 0),
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table finance.invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  invoice_number text not null unique check (length(invoice_number) between 1 and 60),
  description text not null default '',
  issued_on date not null,
  due_on date not null,
  amount_excl_cents bigint not null check (amount_excl_cents >= 0),
  vat_cents bigint not null default 0 check (vat_cents >= 0),
  status text not null default 'verstuurd' check (status in ('concept', 'verstuurd', 'gecrediteerd')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (due_on >= issued_on)
);
create index invoices_project_idx on finance.invoices (project_id);

create table finance.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references finance.invoices (id) on delete cascade,
  received_on date not null,
  amount_cents bigint not null check (amount_cents > 0),
  reference text not null default '',
  created_at timestamptz not null default now()
);
create index payments_invoice_idx on finance.payments (invoice_id);

create table finance.followups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  description text not null check (length(description) between 1 and 500),
  due_on date,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table finance.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  kind text not null check (kind in ('link', 'file')),
  url text check (app_private.is_safe_url(url)),
  file_name text,
  mime_type text,
  size_bytes integer check (size_bytes is null or size_bytes between 0 and 10485760),
  content bytea check (content is null or octet_length(content) <= 10485760),
  created_at timestamptz not null default now(),
  check ((kind = 'link') = (url is not null)),
  check ((kind = 'file') = (content is not null and file_name is not null))
);

-- Betalingen mogen een factuur niet boven het factuurtotaal (incl. btw) brengen.
create or replace function finance.check_payment_total()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_total bigint;
  v_paid bigint;
begin
  select amount_excl_cents + vat_cents into v_total from finance.invoices where id = new.invoice_id;
  select coalesce(sum(amount_cents), 0) into v_paid from finance.payments
   where invoice_id = new.invoice_id and id <> new.id;
  if v_paid + new.amount_cents > v_total then
    raise exception 'Betaling overschrijdt het openstaande bedrag van de factuur';
  end if;
  return new;
end;
$$;
create trigger payments_total_check before insert or update on finance.payments
  for each row execute function finance.check_payment_total();

-- >>> 20261008000300_functions.sql
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

-- >>> 20261008000400_security.sql
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

-- >>> 20261008000500_default_template.sql
-- Universele productietemplate, versie 1. Referentiedata (ook in productie nodig).
-- Datums: anchor + offset_days. Zonder referentiedatum blijft een taak ongepland.

do $$
declare
  v_template uuid;
  v_version uuid;
begin
  insert into public.templates (name, description, is_default)
  values ('Universele productie', 'Standaardtraject van aanvraag tot evaluatie. Zet niet-relevante taken met een reden op Niet van toepassing.', true)
  returning id into v_template;

  insert into public.template_versions (template_id, version, notes)
  values (v_template, 1, 'Eerste versie') returning id into v_version;

  insert into public.template_tasks
    (template_version_id, phase, sort, title, description, checklist, anchor, offset_days, priority, optional, per_shoot_day, signal_key)
  values
  -- Deal / offerte
  (v_version, 'deal', 10, 'Aanvraag en klantgegevens vastleggen', 'Leg vast wie de klant is, wie het aanspreekpunt is en waar de vraag vandaan komt.',
     '["Klant en contactpersoon vastgelegd","Bron van de aanvraag genoteerd","Gewenste timing genoteerd"]', 'project_start', 0, 'hoog', false, false, null),
  (v_version, 'deal', 20, 'Kennismaking / briefing plannen', 'Plan een kennismaking of briefing met de beslisser en het aanspreekpunt.',
     '["Datum geprikt","Agenda en vragen voorbereid"]', 'project_start', 3, 'normaal', false, false, null),
  (v_version, 'deal', 30, 'Doel, doelgroep, gewenste verandering en deliverables uitvragen', 'Wat moet er na de film anders zijn, bij wie, en welke video''s en formaten zijn nodig?',
     '["Doel","Doelgroep","Gewenste verandering","Deliverables en formaten","Budgetindicatie"]', 'project_start', 5, 'normaal', false, false, null),
  (v_version, 'deal', 40, 'Scope en uitgangspunten bepalen', 'Leg de afgesproken scope vast: aantal video''s, draaidagen, feedbackrondes (standaard 2 per video) en uitgangspunten.',
     '["Aantal video''s en formaten","Aantal draaidagen","Feedbackrondes per video","Wat valt buiten scope"]', 'project_start', 7, 'normaal', false, false, null),
  (v_version, 'deal', 50, 'Pitch of voorstel voorbereiden', 'Alleen als de klant een creatief voorstel of pitch verwacht.',
     '["Richting en referenties","Presentatie klaar"]', 'project_start', 10, 'normaal', true, false, null),
  (v_version, 'deal', 60, 'Offerte opstellen en versturen', 'Offerte in het offerteprogramma. Bedragen en marges horen in het afgeschermde financiële deel, niet in deze taak.',
     '["Offerte opgesteld","Intern gecontroleerd","Verstuurd"]', 'project_start', 10, 'hoog', false, false, null),
  (v_version, 'deal', 70, 'Offerte opvolgen', 'Bel of mail de klant als er nog geen reactie is. Zet de taak op Wacht op klant met een opvolgdatum.',
     '["Opgevolgd","Vragen beantwoord"]', 'project_start', 17, 'normaal', false, false, null),
  (v_version, 'deal', 80, 'Akkoord vastleggen en productie starten', 'Leg het akkoord vast (datum en bron) en kies daarna zelf de volgende fase.',
     '["Akkoord vastgelegd","Planning globaal afgestemd","Fase bijgewerkt"]', 'none', 0, 'hoog', false, false, null),

  -- Strategie & concept
  (v_version, 'strategie', 10, 'Projectdoel en gewenste impact vastleggen', 'Formuleer in één of twee zinnen wat de film moet bereiken. Bij kleine opdrachten volstaat een korte notitie.',
     '["Doel geformuleerd","Gewenste impact meetbaar gemaakt waar mogelijk"]', 'none', 0, 'normaal', false, false, null),
  (v_version, 'strategie', 20, 'Doelgroep en kernboodschap bepalen', 'Voor wie is het en wat moet blijven hangen?',
     '["Doelgroep beschreven","Kernboodschap in één zin"]', 'none', 0, 'normaal', false, false, null),
  (v_version, 'strategie', 30, 'Strategie / creatieve richting uitwerken', 'Kies de aanpak, toon en distributie. Mag licht blijven bij eenvoudige opdrachten.',
     '["Aanpak","Toon en stijl","Kanalen en formaten"]', 'none', 0, 'normaal', false, false, null),
  (v_version, 'strategie', 40, 'Concept en verhaal uitwerken', 'Werk het concept en de verhaallijn uit.',
     '["Concept","Verhaallijn","Referenties"]', 'shoot_day', -28, 'normaal', false, false, null),
  (v_version, 'strategie', 50, 'Concept intern bespreken', 'Kort intern toetsen voordat het naar de klant gaat.',
     '["Feedback verwerkt"]', 'shoot_day', -24, 'normaal', false, false, null),
  (v_version, 'strategie', 60, 'Concept met klant afstemmen en akkoord vastleggen', 'Presenteer het concept en leg het akkoord met datum en bron vast.',
     '["Gepresenteerd","Akkoord vastgelegd"]', 'shoot_day', -21, 'hoog', false, false, null),
  (v_version, 'strategie', 70, 'Bepalen hoe het resultaat wordt geëvalueerd', 'Spreek af hoe en wanneer jullie terugkijken op het resultaat.',
     '["Evaluatiemoment afgesproken","Criteria benoemd"]', 'none', 0, 'laag', false, false, null),

  -- Pre-productie (relatief aan de eerste draaidag)
  (v_version, 'preproductie', 10, 'Kick-off / brainstorm', 'Interne kick-off met het team en waar nodig de klant.',
     '["Team uitgenodigd","Doelen en concept gedeeld"]', 'shoot_day', -21, 'normaal', false, false, null),
  (v_version, 'preproductie', 20, 'Productiedocument en planning opstellen', 'Eén document met planning, rollen, locaties en afspraken.',
     '["Planning","Rollen","Contactlijst"]', 'shoot_day', -14, 'hoog', false, false, null),
  (v_version, 'preproductie', 30, 'Script, shotlist en eventueel storyboard', 'Uitwerken en laten afstemmen waar nodig.',
     '["Script","Shotlist","Storyboard (optioneel)"]', 'shoot_day', -10, 'hoog', false, false, null),
  (v_version, 'preproductie', 40, 'Locaties, casting, styling, props en toestemmingen regelen', 'Alleen wat relevant is; zet de rest op n.v.t. in de checklist-notities.',
     '["Locaties","Casting","Styling","Props","Toestemmingen / quitclaims"]', 'shoot_day', -10, 'normaal', false, false, null),
  (v_version, 'preproductie', 50, 'Muziek en eventuele voice-over bepalen', 'Licenties en stemkeuze vastleggen.',
     '["Muziek gekozen","Licentie geregeld","Voice-over geboekt (indien nodig)"]', 'shoot_day', -7, 'normaal', false, false, null),
  (v_version, 'preproductie', 60, 'Freelancers en crew boeken', 'Boek crew via Productie → Crew. Tarieven horen in het eigenaarsdeel.',
     '["Crew benaderd","Opties genomen","Bevestigd"]', 'shoot_day', -14, 'hoog', false, false, null),
  (v_version, 'preproductie', 70, 'Crewcommunicatie voorbereiden', 'Groepsapp of mail; leg een eventuele groepsapp-link vast bij Documenten en links.',
     '["Kanaal gekozen","Link vastgelegd"]', 'shoot_day', -7, 'laag', false, false, null),
  (v_version, 'preproductie', 80, 'Apparatuur reserveren / huren', 'Reserveer wat niet in eigen bezit is.',
     '["Lijst gemaakt","Gereserveerd"]', 'shoot_day', -7, 'normaal', false, false, null),
  (v_version, 'preproductie', 90, 'Apparatuur ophalen en controleren', 'Batterijen, kaarten, lenzen, audio.',
     '["Opgehaald","Getest","Kaarten leeg en geformatteerd"]', 'shoot_day', -1, 'hoog', false, false, null),
  (v_version, 'preproductie', 100, 'Briefing en callsheet maken en delen', 'Callsheet per draaidag vastleggen bij Productie.',
     '["Callsheet gemaakt","Gedeeld met crew","Gedeeld met klant"]', 'shoot_day', -3, 'hoog', false, false, null),
  (v_version, 'preproductie', 110, 'Definitieve planning en verwachtingen met klant en crew controleren', 'Laatste check op tijden, locatie en verwachtingen.',
     '["Klant akkoord","Crew akkoord"]', 'shoot_day', -2, 'hoog', false, false, null),

  -- Productie (per draaidag)
  (v_version, 'productie', 10, 'Draaidagplanning vastleggen', 'Planning, tijden en locatie van deze draaidag vastleggen bij Productie.',
     '["Tijden","Locatie","Shotvolgorde"]', 'shoot_day', -3, 'hoog', false, true, null),
  (v_version, 'productie', 20, 'Crew- en apparatuurcheck', 'Iedereen aanwezig, alles werkt.',
     '["Crew aanwezig","Apparatuur getest"]', 'shoot_day', 0, 'hoog', false, true, null),
  (v_version, 'productie', 30, 'Opnames uitvoeren', 'Draai volgens shotlist.',
     '["Shotlist afgewerkt","Extra b-roll"]', 'shoot_day', 0, 'hoog', false, true, null),
  (v_version, 'productie', 40, 'Materiaal controleren', 'Steekproef op focus, audio en belichting.',
     '["Beeld gecontroleerd","Audio gecontroleerd"]', 'shoot_day', 0, 'hoog', false, true, null),
  (v_version, 'productie', 50, 'Back-up op SSD en tweede opslag', 'Kopieer naar SSD én een tweede opslag (bijv. HDD).',
     '["SSD","Tweede opslag (HDD)"]', 'shoot_day', 0, 'urgent', false, true, null),
  (v_version, 'productie', 60, 'Back-up gecontroleerd — pas daarna materiaal verwijderen', 'Bevestig dat beide back-ups volledig en leesbaar zijn voordat kaarten worden gewist.',
     '["Bestandsaantallen vergeleken","Steekproef afgespeeld","Kaarten vrijgegeven"]', 'shoot_day', 1, 'urgent', false, true, 'backup_verified'),
  (v_version, 'productie', 70, 'Apparatuur retourneren', 'Indien van toepassing.',
     '["Geretourneerd","Schade gemeld (indien nodig)"]', 'shoot_day', 1, 'normaal', true, true, null),

  -- Post-productie (relatief aan projectdeadline)
  (v_version, 'postproductie', 10, 'Materiaal importeren, organiseren en spotten', 'Structuur in het project, selects markeren.',
     '["Geïmporteerd","Mappenstructuur","Selects"]', 'shoot_day', 2, 'normaal', false, false, null),
  (v_version, 'postproductie', 20, 'Montage per video / deliverable', 'Maak per deliverable een montage.',
     '["Ruwe montage","Fijnmontage"]', 'project_deadline', -21, 'hoog', false, false, null),
  (v_version, 'postproductie', 30, 'Audio, muziek, voice-over, kleur en titels', 'Afwerking.',
     '["Audio mix","Muziek","Voice-over","Kleurcorrectie","Titels en ondertitels"]', 'project_deadline', -14, 'normaal', false, false, null),
  (v_version, 'postproductie', 40, 'Interne kwaliteitscontrole', 'Bekijk elke video kritisch voordat de klant hem ziet.',
     '["Spelling en titels","Audio-niveaus","Exportinstellingen"]', 'project_deadline', -12, 'hoog', false, false, null),
  (v_version, 'postproductie', 50, 'Eerste versie in Vimeo plaatsen en reviewlink vastleggen', 'Leg per video een versie met Vimeo-reviewlink vast bij Deliverables.',
     '["Geüpload","Reviewlink vastgelegd","Klant geïnformeerd"]', 'project_deadline', -12, 'hoog', false, false, null),
  (v_version, 'postproductie', 60, 'Feedbackronde 1 verzamelen en verwerken', 'Feedback blijft in Vimeo; houd de rondestatus per video bij.',
     '["Feedback ontvangen","Verwerkt"]', 'project_deadline', -8, 'hoog', false, false, null),
  (v_version, 'postproductie', 70, 'Nieuwe versie opleveren', 'Nieuwe versie per video met reviewlink.',
     '["Geüpload","Klant geïnformeerd"]', 'project_deadline', -6, 'normaal', false, false, null),
  (v_version, 'postproductie', 80, 'Feedbackronde 2 verzamelen en verwerken', 'Laatste inbegrepen ronde. Extra rondes alleen na geregistreerd meerwerk.',
     '["Feedback ontvangen","Verwerkt"]', 'project_deadline', -3, 'hoog', false, false, null),
  (v_version, 'postproductie', 90, 'Definitief klantakkoord vastleggen', 'Registreer per video het akkoord met datum en bron (Vimeo, e-mail, …).',
     '["Akkoord per video vastgelegd"]', 'project_deadline', -2, 'hoog', false, false, null),
  (v_version, 'postproductie', 100, 'Eindcontrole en exports per afgesproken formaat', 'Exports per formaat (16:9, 9:16, 1:1, …).',
     '["Alle formaten geëxporteerd","Gecontroleerd"]', 'project_deadline', -1, 'hoog', false, false, null),
  (v_version, 'postproductie', 110, 'Klant uitnodigen in de editsuite en stills opleveren', 'Optioneel.',
     '["Sessie gepland","Stills geleverd"]', 'none', 0, 'laag', true, false, null),

  -- Oplevering
  (v_version, 'oplevering', 10, 'Definitieve bestanden en downloadlinks delen', 'Leg de definitieve links per video vast bij Deliverables.',
     '["Links vastgelegd","Gedeeld met klant"]', 'project_deadline', 0, 'hoog', false, false, null),
  (v_version, 'oplevering', 20, 'Controleren of alle video''s, formaten en ondertitels zijn geleverd', 'Vergelijk met de afgesproken scope.',
     '["Video''s","Formaten","Ondertitels"]', 'project_deadline', 0, 'hoog', false, false, null),
  (v_version, 'oplevering', 30, 'Gebruiksafspraken / rechten en overdracht controleren', 'Waar relevant: muzieklicenties, beeldrechten, quitclaims.',
     '["Rechten gecontroleerd","Overdracht vastgelegd"]', 'project_deadline', 2, 'normaal', true, false, null),
  (v_version, 'oplevering', 40, 'Archivering en back-up afhandelen', 'Project archiveren volgens de archiefstructuur.',
     '["Projectbestanden gearchiveerd","Back-up gecontroleerd"]', 'project_deadline', 7, 'normaal', false, false, null),

  -- Afronding & betaling (financiële details in het afgeschermde eigenaarsdeel)
  (v_version, 'afronding', 10, 'Administratieve afronding controleren', 'Alles vastgelegd en afgesloten?',
     '["Documenten compleet","Contacten bijgewerkt"]', 'project_deadline', 7, 'normaal', false, false, null),
  (v_version, 'afronding', 20, 'Freelancerkosten, facturatie en betaling opvolgen', 'Uitvoeren in het afgeschermde financiële deel van de eigenaar. Geen bedragen in deze taak noteren.',
     '["Gecontroleerd in Financiën"]', 'project_deadline', 7, 'hoog', false, false, null),
  (v_version, 'afronding', 30, 'Meerwerk controleren', 'Is er meerwerk geleverd dat nog niet is vastgelegd?',
     '["Gecontroleerd"]', 'project_deadline', 3, 'normaal', false, false, null),
  (v_version, 'afronding', 40, 'Afspraken over betaling opvolgen', 'Controleer in Financiën of alles is betaald.',
     '["Gecontroleerd in Financiën"]', 'project_deadline', 30, 'normaal', false, false, null),

  -- Evaluatie
  (v_version, 'evaluatie', 10, 'Interne debrief', 'Wat ging goed, wat kan beter?',
     '["Debrief gehouden","Leerpunten genoteerd"]', 'project_deadline', 7, 'normaal', false, false, 'evaluation'),
  (v_version, 'evaluatie', 20, 'Klantevaluatie', 'Vraag de klant om terugkoppeling.',
     '["Gesprek of vragenlijst","Terugkoppeling vastgelegd"]', 'project_deadline', 14, 'normaal', false, false, 'evaluation'),
  (v_version, 'evaluatie', 30, 'Resultaten en leerpunten vastleggen', 'Plan zo nodig een latere evaluatiedatum om resultaten te meten.',
     '["Resultaten","Leerpunten","Eventuele latere evaluatiedatum"]', 'project_deadline', 30, 'laag', false, false, null),
  (v_version, 'evaluatie', 40, 'Case, publicatie, BTS of testimonial afstemmen', 'Toestemming vragen voor publicatie.',
     '["Toestemming","Materiaal geselecteerd"]', 'project_deadline', 14, 'laag', true, false, null),
  (v_version, 'evaluatie', 50, 'Mogelijke volgende productie opvolgen', 'Kansen voor een vervolg bespreken.',
     '["Besproken","Opvolgdatum gezet"]', 'project_deadline', 45, 'laag', false, false, null);

  update public.template_versions set published_at = now() where id = v_version;
end $$;

-- >>> 20261008000600_staff_members.sql
-- Teamlijst voor keuzelijsten (projectverantwoordelijke, taakverantwoordelijke).
-- Medewerkers kunnen user_roles van anderen niet lezen; deze functie geeft alleen
-- id + naam van actieve interne teamleden terug, en alleen aan het interne team.
create or replace function public.staff_members()
returns table (id uuid, full_name text, role public.app_role)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_staff() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, ur.role
      from public.user_roles ur join public.profiles p on p.id = ur.user_id
     where ur.active and ur.role in ('owner', 'employee')
     order by ur.role, p.full_name;
end;
$$;
revoke execute on function public.staff_members() from public, anon;
grant execute on function public.staff_members() to authenticated;

-- >>> 20261008000700_template_assignee.sql
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


-- Registreer de migraties, zodat 'supabase db push' ze later niet opnieuw uitvoert.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261008000100', 'core_schema') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261008000200', 'finance') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261008000300', 'functions') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261008000400', 'security') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261008000500', 'default_template') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261008000600', 'staff_members') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261008000700', 'template_assignee') on conflict (version) do nothing;

commit;
