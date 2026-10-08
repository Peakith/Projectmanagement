-- Eerste eigenaar instellen via het Supabase-dashboard (alternatief voor `npm run owner:create`).
--
-- 1. Supabase → Authentication → Users → "Add user" → "Create new user":
--    vul e-mail + wachtwoord in en vink "Auto Confirm User" aan.
-- 2. Vervang hieronder het e-mailadres en voer dit uit in de SQL Editor.
--
-- Dit werkt alleen als er nog geen actieve eigenaar is (veiligheid tegen per ongeluk extra eigenaren).

do $$
declare
  v_email text := 'lars@studiobrutaal.nl';   -- <-- aanpassen
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'Geen gebruiker met e-mail % gevonden. Maak die eerst aan onder Authentication → Users.', v_email;
  end if;
  if exists (select 1 from public.user_roles where role = 'owner' and active and user_id <> v_user) then
    raise exception 'Er is al een andere actieve eigenaar.';
  end if;
  insert into public.profiles (id, email, full_name)
  values (v_user, v_email, split_part(v_email, '@', 1))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role, active)
  values (v_user, 'owner', true)
  on conflict (user_id) do update set role = 'owner', active = true, deactivated_at = null;
  raise notice '% is nu eigenaar.', v_email;
end $$;
