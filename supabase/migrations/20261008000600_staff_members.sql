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
