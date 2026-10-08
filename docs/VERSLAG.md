# Verslag: uitgevoerde checks, resultaten en blokkades

Datum: 8 oktober 2026.

## Omgeving waarin is gebouwd en getest

- Node 22.22, Next.js 16.4.0, React 19.3, Tailwind 4.3, @supabase/supabase-js 2.117.3, @supabase/ssr 0.12.7, Playwright 1.56.1 (Chromium).
- **Docker-images konden niet worden opgehaald** (Docker Hub: 429, AWS ECR en GHCR: 403 vanuit de bouwomgeving). `npx supabase start` kon daardoor hier niet draaien.
- In plaats daarvan is getest tegen een **Supabase-compatibele lichte stack** met de echte Supabase-componenten: PostgreSQL 16.15, **Supabase Auth (GoTrue) v2.170.0** en **PostgREST v12.2.3** achter een kleine gateway met dezelfde paden (`/auth/v1`, `/rest/v1`), poorten en lokale sleutels als de Supabase CLI. De standaard ruime Supabase-grants zijn nagebootst, zodat de migraties hun eigen beperkingen moeten aanbrengen. Deze stack zit in de repo (`npm run stack:start`) voor Linux/CI.
- Login, JWT's, RLS en grants zijn dus met echte componenten en echte, beperkte sessies getest — niet met een gesimuleerde login.

## Resultaten

| Check | Resultaat |
| --- | --- |
| `npm run typecheck` | ✅ geen fouten |
| `npm run lint` | ✅ geen fouten of waarschuwingen |
| `npm run build` (productie) | ✅ geslaagd, alle routes dynamisch (geen gedeelde cache) |
| Unit-tests (`npm test`) | ✅ 44/44 — datums/weekgrenzen Amsterdam, werkdagen, geld in centen, aandachtsindicatie, feedbackrondes, financiën (meerdere facturen, deelbetalingen, onbekende kosten), afrondingscheck, dashboardtellingen (draaidag één keer), klantpublicatie, webhook-signatuur, CSV-injectie |
| Integratietests (`npm run test:integration`) | ✅ 34/34 — zie hieronder |
| E2E (`npm run test:e2e`) | ✅ 10/10 (desktop + mobiel) |
| Browsercontrole alle pagina's per rol | ✅ 48 pagina-bezoeken over 4 rollen, geen consolefouten; rolgrenzen in de UI correct (redirect naar eigen omgeving, /geen-toegang of 404) |
| Mobiel | ✅ dashboard, planning en crewomgeving op 390 px bekeken; e2e-freelancerflow op Pixel 7 |

### Integratietests (echte API, echte sessies)

- Projectaanmaak vanuit template is transactioneel, taken blijven na een nieuwe sessie bestaan; zonder referentiedatum blijven taken ongepland.
- Planningsvoorstel na deadline-wijziging en verschoven draaidag; niets verandert vóór bevestiging.
- Eén draaidag per datum per project; nieuwe draaidag krijgt eigen taken.
- Wacht-sinds wordt geregistreerd; afgeronde volgende actie geeft precies één melding, ook bij heropenen.
- Feedbackrondes per video, akkoord na één ronde, ronde 3 alleen als extra met reden en goedkeuring (en alleen door de eigenaar), akkoord met versie van een andere video geweigerd, onveilige links geweigerd.
- Meerdere facturen en deelbetalingen; overbetaling geweigerd; afgeleide bedragen kloppen.
- Herhaalde en **gelijktijdige** offerte-events → één project, één set taken, één melding per eigenaar, fase niet automatisch gewijzigd.
- Jobs: dedupe bij inplannen, herhaald draaien geeft geen nieuwe meldingen, mislukte job krijgt retry + foutregistratie.
- Medewerker kan financiële records niet lezen, toevoegen, wijzigen of verwijderen; ziet geen eigenaar-activiteit; kan eigen rol niet verhogen; kan geen portaal of accountkoppeling beheren.
- Freelancer leest geen basistabellen, ziet alleen toegewezen projecten, krijgt geen toegang via gewijzigde project-ID, ziet geen interne notities/telefoonnummers van anderen, mag alleen toegestane taakvelden wijzigen.
- Klant A ziet niets van klant B (ook niet met het juiste project-ID); ingetrokken toegang wordt in de database geweigerd; klant kan zichzelf geen toegang of rol geven.
- Niet-ingelogd ziet niets; service-functies (scan, jobs, offerte-events) zijn niet aanroepbaar met een gebruikerssessie.

### E2E

Hoofdflow (project vanuit template, volgende actie, wachtstatus, herladen, dashboard), expliciete klantpublicatie met preview en portaalgrens, medewerker zonder financiële toegang (ook export), freelancer die een gedeelde taak bijwerkt (desktop + mobiel), en formulieren: taakdetail/checklist/blokkade/opmerking, draaidag toevoegen en verplaatsen + planningsvoorstel, boeking zonder account, link- en bestandsupload met beveiligde download (klant krijgt 404), versies/rondes/extra ronde/akkoord, facturen met deelbetaling, uitnodiging met werkende eenmalige link, nieuwe templateversie publiceren.

Overige handmatige verificaties: `npm run jobs:run` (2× → tweede keer 0 jobs), `/api/cron/run` zonder token 404 en met token 200, offerte-webhook uit → 404, `quotes:simulate` created/accepted/accepted → één project, `owner:create` weigert bij bestaande eigenaar.

## Tijdens het testen gevonden en opgelost

- Formuliervelden die alleen soms getoond worden (nieuwe klant, blokkadereden, extra ronde, uitnodiging) werden ten onrechte geweigerd → schema's accepteren nu ontbrekende velden.
- Bevestigingsmelding viel weg als een formulier na opslaan verdween (planningsvoorstel) → melding direct na de actie.
- Akkoord-keuzelijst bleef op een oude versie staan na een nieuwe versie → formulieren vernieuwen bij nieuwe versies.
- Templatetaken hadden geen interne verantwoordelijke → standaard de projectverantwoordelijke (migratie `…000700`).

## Niet kunnen verifiëren / nog nodig

1. **Supabase CLI met Docker** (`npx supabase start`, PostgreSQL 17, nieuwere Auth/PostgREST) is hier niet uitgevoerd omdat images niet konden worden gedownload. Verwachting: werkt identiek (standaard SQL, geen versie-specifieke features), maar draai op je eigen machine eenmalig `npx supabase start && npm run db:seed && npm run test:integration` als bevestiging.
2. **E-mailverzending** (wachtwoord vergeten) is niet end-to-end getest: geen mailserver in de testomgeving. De uitnodigings- en herstellinks via *Instellingen → Gebruikers* zijn wel getest en werken zonder mail.
3. **Productiescheduler** is niet aangesloten (geen hosting gekozen); lokaal commando en beveiligd endpoint werken.
4. **Gehost Supabase-project**: niet aangemaakt. Let op het toevoegen van `finance` aan *Exposed schemas*.
5. **Offerteprogramma**: onbekend; alleen de voorbereide, idempotente service en een uitgeschakelde gesigneerde webhook.
6. **Toegankelijkheid**: labels, focusstijl, toetsenbordbediening, statussen met tekst+icoon en `aria-current` zijn toegepast en via Playwright (label-selectors) deels bewezen; er is geen formele audit (bijv. axe/Lighthouse) uitgevoerd.
7. **shadcn/ui-registry** was niet bereikbaar; componenten zijn in dezelfde stijl handmatig opgenomen (Radix + Tailwind + cva).
