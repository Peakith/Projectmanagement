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
