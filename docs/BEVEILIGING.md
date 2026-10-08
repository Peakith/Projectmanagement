# Rollen en beveiliging

Rechten worden in de **database** afgedwongen (Row Level Security + beperkte grants) en daarnaast in elke Server Action en API-route gecontroleerd. De interface verbergt alleen wat je toch al niet mag.

## Rollen

| | Eigenaar | Medewerker / stagiaire | Freelancer met account | Klant |
| --- | --- | --- | --- | --- |
| Projecten, taken, planning, crew, deliverables | alles | lezen + bijwerken | alleen via `crew_*`-functies: toegewezen projecten en gedeelde taken | — |
| Financiën (schema `finance`), tarieven, facturen, exports | ✔ | ✘ | ✘ | ✘ |
| Rollen, templates, portaalpublicatie en -toegang, integraties | ✔ | ✘ | ✘ | ✘ |
| Project definitief verwijderen | ✔ (na archiveren, met getypte naam) | ✘ (wel archiveren) | ✘ | ✘ |
| Klantportaal | beheer + preview | ✘ | ✘ | alleen gepubliceerde momentopname, alleen bij actieve toegang |

## Hoe het is afgedwongen

- **Rolbron**: tabel `public.user_roles`, alleen schrijfbaar via `admin_*`-functies (eigenaarscheck in de database) of de service-sleutel in scripts. `user_metadata` wordt nooit voor rechten gebruikt. Een gebruiker kan de eigen rol niet wijzigen, en de eigenaarsrol kan alleen via `npm run owner:create` worden toegekend.
- **Hulpfuncties** in het niet-geëxposeerde schema `app_private` (`is_owner()`, `is_staff()`, `my_freelancer_id()`, `crew_has_project()`), `SECURITY DEFINER` met lege `search_path`.
- **Grants**: Supabase geeft standaard ruime rechten; de migratie `…_security.sql` trekt eerst alles in en geeft daarna per tabel alleen de benodigde rechten. Kolomrechten beperken o.a. `profiles` (alleen `full_name`), `notifications` (alleen `read_at`) en `freelancers` (accountkoppeling `user_id` niet schrijfbaar).
- **Financiën** in schema `finance`; elke tabel heeft één policy: alleen eigenaar. Activiteiten van financiële wijzigingen krijgen zichtbaarheid `owner` en bevatten nooit bedragen. Signaleringen over facturen gaan alleen naar eigenaren.
- **Freelancers** hebben géén select-rechten op basistabellen (projects, tasks, clients, …). Ze krijgen alleen een beperkte JSON via `crew_project()` (geen interne notities, geen contactgegevens van andere freelancers, alleen crew-zichtbare opmerkingen en documenten). `crew_update_task()` staat alleen status (te doen/bezig/wacht/klaar) en het afvinken van bestaande checklistitems toe.
- **Klanten** lezen alleen `portal_snapshots` (expliciet gepubliceerde momentopname) bij actieve `portal_access`. Interne velden worden nooit automatisch gekopieerd; de eigenaar kiest per onderdeel.
- **Gewijzigde ID's in URL's** geven geen extra toegang: alle pagina's laden data met de sessie van de gebruiker, RLS levert dan niets op en de app toont 404.
- **Downloads** lopen via `/api/documenten/[id]` en `/api/financien/documenten/[id]`: sessie + RLS, altijd `attachment`, `Cache-Control: private, no-store`, `nosniff` en sandbox-CSP.
- **Caching**: alle pagina's zijn dynamisch en krijgen `Cache-Control: private, no-store`.
- **Service-sleutel** (`SUPABASE_SECRET_KEY`) alleen server-side: accountaanmaak (na eigenaarscheck), scheduler, offerte-integratie, scripts. Gewone verzoeken gebruiken altijd de sessie.
- **Externe links** worden in de database (`app_private.is_safe_url`) en in de app gevalideerd: alleen `http(s)`, geen `javascript:`/`data:`.
- **Intrekken**: `admin_set_active(false)` werkt direct omdat elke databasevraag de actieve rol controleert; rolwijziging trekt portaaltoegang/freelancerkoppeling van de vorige rol in.
- **Open registratie** staat uit (`enable_signup = false`); accounts ontstaan via uitnodiging door de eigenaar.
- **Cron-endpoint** en **offerte-webhook** geven 404 zonder geldige configuratie; cron vergelijkt het Bearer-token timing-safe, de webhook vereist een HMAC-SHA256-signatuur met tijdstempel (max. 5 min).
- **Logging**: activiteiten bevatten samenvattingen zonder tokens of financiële payloads; offerte-events slaan geen payload op.

## Getest

`tests/integration/access.test.ts` logt in als elke rol via Supabase Auth (echte JWT's) en probeert directe API-verzoeken: medewerker leest/wijzigt geen financiën en kan zijn rol niet verhogen; freelancer leest geen basistabellen, krijgt geen ander project via een gewijzigde ID en kan alleen toegestane taakvelden wijzigen; klant A ziet niets van klant B; ingetrokken portaaltoegang wordt in de database geweigerd; niet-ingelogd ziet niets; service-functies zijn niet aanroepbaar door gebruikers.
