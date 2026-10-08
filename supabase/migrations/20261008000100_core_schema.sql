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
