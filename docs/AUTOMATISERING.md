# Automatiseringen, scheduler en integraties

## Principes

- Automatiseringen **signaleren en stellen voor**; ze wijzigen nooit zelf een fase of deadline.
- Meldingen zijn in-app (`public.notifications`). Er gaan geen externe berichten uit; dat vereist later een aparte instelling en expliciete activering.
- Elke melding heeft een unieke sleutel per gebeurtenis en datum (`unique (user_id, dedupe_key)`), dus herladen, opnieuw uitvoeren of een retry levert geen stapel identieke meldingen op.

## Direct (databasetriggers)

| Gebeurtenis | Effect |
| --- | --- |
| Project aangemaakt | Taken uit de templateversie transactioneel aangemaakt (`create_project`), inclusief taken per draaidag |
| Draaidag toegevoegd | Taken per draaidag uit de templateversie van het project (`add_shoot_day`) |
| Taak naar *Wacht op klant/leverancier* | `waiting_since` wordt gezet; weg uit wachtstatus → gewist |
| Gekozen volgende actie afgerond | Project krijgt `next_action_needs_update`, melding aan eigenaar + projectverantwoordelijke |
| Referentiedatum gewijzigd | Planningsvoorstel (`plan_proposal`) op het projectoverzicht; pas na bevestiging toegepast |
| Wijzigingen | Auditregels in `activities` (actor + tijdstip), zichtbaarheid volgt de brongegevens |

## Gepland (signaalscan via de jobtabel)

`public.run_signal_scan(datum)` maakt meldingen voor: achterstallige niet-optionele taken, deadlines binnen 2 dagen, wachtende taken met bereikte opvolgdatum, volgende actie op datum, draaidag ≤ 7 dagen met onbevestigde crew, draaidag ≤ 3 dagen zonder callsheet of met open pre-productietaken, onbevestigde back-upcontrole na een draaidag, uitgebleven of onverwerkte reviewfeedback, vervallen facturen en financiële opvolging (alleen eigenaar), evaluatieherinnering 14 dagen na oplevering.

Afrondingscheck (ontbrekende video's/akkoord/links, open relevante taken, en voor de eigenaar openstaande facturen en ontbrekende kosten) staat op het projectoverzicht; *Afgerond* kiezen vraagt om bevestiging.

## Jobtabel

`app_private.jobs` (niet via de API bereikbaar) met `status`, `attempts`, `max_attempts` (5), `run_at`, `last_error`, `dedupe_key` (uniek). Functies alleen voor `service_role`: `enqueue_job`, `claim_jobs` (`FOR UPDATE SKIP LOCKED`, vastgelopen jobs na 15 min opnieuw), `complete_job`, `fail_job` (exponentiële backoff 2,4,8… minuten; na 5 pogingen `failed`). De runner (`src/lib/jobs/runner.ts`) plant de signaalscan maximaal één keer per uur (Amsterdamse tijd) in. De eigenaar ziet de jobs onder **Instellingen → Automatisering** en kan daar handmatig uitvoeren.

## Hoe de scheduler draait

- **Lokaal**: `npm run jobs:run` (eenmalig) of `npm run jobs:run -- --loop` (elke 15 minuten).
- **Productie** (nog aan te sluiten): een externe scheduler roept elk kwartier
  `POST https://<app>/api/cron/run` aan met header `Authorization: Bearer <CRON_SECRET>`. Opties:
  - Vercel Cron (`vercel.json` met `crons`; Vercel stuurt dan `Authorization: Bearer $CRON_SECRET` mee — controleer de frequentiegrens van je plan),
  - Supabase `pg_cron` + `pg_net` die het endpoint aanroept,
  - GitHub Actions `schedule` met `curl`.
  Zonder geldige `CRON_SECRET` (≥ 32 tekens) geeft het endpoint 404.

## Offerte-integratie (voorbereid, niet gekoppeld)

Het offerteprogramma is nog onbekend, dus er is géén werkende koppeling verzonnen. Wel klaar:

- Provider-onafhankelijk eventformaat (`quote.created`, `quote.accepted`) met `source`, `event_id` en stabiele `external_id` (zie Instellingen → Integraties).
- `public.process_quote_event()`: idempotent via unieke constraints (`integration_events (source, event_id)`, `integration_quotes (source, external_id)` en uniek `project_id`) en een advisory lock per offerte tegen gelijktijdige events. `quote.created` maakt één project in *Deal / offerte*; `quote.accepted` werkt hetzelfde project bij (geen tweede project of tweede takenset) en stelt een faseovergang voor via een melding.
- Testbare service `src/lib/integrations/quotes.ts`; simulatie: `npm run quotes:simulate`.
- Webhook `POST /api/integrations/quotes` staat standaard **uit**. Aanzetten voor een echte provider:
  1. Controleer of de provider webhooks kan **signeren** (HMAC) of geverifieerde events levert. Zo niet: gebruik een polling-job met de provider-API in plaats van een publieke webhook.
  2. Schrijf een kleine adapter die het providerformaat naar het eventformaat hierboven vertaalt (eigen `source`-naam, provider-event-ID als `event_id`).
  3. Zet `QUOTE_WEBHOOK_SECRET` (≥ 32 tekens, ook bij de provider) en `QUOTE_WEBHOOK_ENABLED=true`. Huidige verificatie: header `X-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`, max. 5 minuten oud; pas dit aan het schema van de provider aan.
  4. Fouten geven 500 zodat de provider opnieuw probeert; verwerking is idempotent.

## Asana-migratie (later)

Bouw de import pas als er een echte export is. Voorgestelde aanpak en mapping:

| Asana | Studio Brutaal |
| --- | --- |
| Project | `projects` (naam, klant uit projectnaam/custom field, deadline uit due date) |
| Sectie | fase (mappingtabel per sectienaam, onbekend → handmatig kiezen) |
| Taak | `tasks` (titel, beschrijving, deadline, voltooid → *Klaar*) |
| Subtaak | `tasks.parent_task_id` |
| Toegewezen persoon | `assignee_id` via e-mail → profiel (onbekend → projectverantwoordelijke) |
| Opmerkingen | `task_comments` (intern) |
| Bijlagen | als links in `documents` |

Werkwijze: (1) export inlezen (CSV/JSON) in een stagingtabel, (2) **preview** in de app met mapping per kolom en fase, (3) **validatie** (verplichte velden, datums, onbekende personen), (4) **deduplicatie** via `asana_gid` als externe sleutel (uniek), zodat opnieuw importeren bijwerkt in plaats van verdubbelt, (5) import in één transactie per project, (6) rapport van wat is overgeslagen.
