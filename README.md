# Studio Brutaal — projectsysteem

Eigen werkomgeving voor filmagency Studio Brutaal: van offerteaanvraag tot betaling en evaluatie. Eén Next.js-applicatie met Supabase (PostgreSQL, Auth, Row Level Security).

- **Dashboard**: lopende projecten, fase, eerstvolgende actie (wie/wanneer), deadlines en draaidagen deze week, wachten op klant/leverancier, uitlegbare aandachtsindicatie.
- **Projecten** vanuit een geversioneerde productietemplate (50 taken in 8 fases + 7 taken per draaidag).
- **Productie**: meerdere draaidagen, callsheets, crewboekingen (ook freelancers zonder account), signalering van dubbele boekingen.
- **Deliverables**: video's, versies met Vimeo-reviewlinks, twee feedbackrondes per video, extra rondes alleen na goedkeuring, klantakkoord.
- **Financiën** (alleen eigenaar, afgeschermd schema): offerte, meerwerk, kosten, facturen, deelbetalingen, projectbijdrage.
- **Klantportaal**: alleen expliciet gepubliceerde informatie, per project toegang.
- **Freelancer-omgeving**: alleen toegewezen projecten en expliciet gedeelde taken.
- **Automatiseringen**: persistente jobtabel, in-app meldingen met deduplicatie, voorbereide offerte-integratie.

Meer documentatie:

| Document | Inhoud |
| --- | --- |
| [docs/HANDLEIDING.md](docs/HANDLEIDING.md) | Korte gebruikershandleiding |
| [docs/BEVEILIGING.md](docs/BEVEILIGING.md) | Rollen, rechtenmodel en hoe het is afgedwongen |
| [docs/AUTOMATISERING.md](docs/AUTOMATISERING.md) | Signaleringen, scheduler, offerte-integratie, Asana-import |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploymentvoorstel (nog niet uitgevoerd) |
| [docs/VERSLAG.md](docs/VERSLAG.md) | Uitgevoerde checks, resultaten en open punten |

---

## 1. Vereisten

- Node.js 20.9 of nieuwer (getest met Node 22) en npm.
- Eén van:
  - **Aanbevolen (Mac/Windows/Linux):** Docker Desktop + Supabase CLI (`npx supabase`, wordt via npm opgehaald).
  - **Alternatief (Linux/CI zonder Docker):** de meegeleverde lichte stack: PostgreSQL 16+, `curl`, internettoegang naar GitHub-releases (downloadt Supabase Auth en PostgREST).

## 2. Installatie

```bash
npm install
cp .env.example .env.local
```

### Optie A — Supabase CLI met Docker (aanbevolen)

```bash
npx supabase start          # start Postgres, Auth, REST, Studio en Mailpit/Inbucket; past alle migraties toe
npx supabase status -o env  # toont de sleutels
```

Zet in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY of "Publishable key">
SUPABASE_SECRET_KEY=<SERVICE_ROLE_KEY of "Secret key">
```

Database opnieuw opbouwen: `npx supabase db reset` (de seed draait bewust niet automatisch, zie stap 3).

### Optie B — lichte lokale stack zonder Docker (Linux/CI)

```bash
npm run stack:start   # PostgreSQL + Supabase Auth + PostgREST + gateway op dezelfde poorten als de CLI
npm run stack:reset   # alles weg en opnieuw opbouwen (alleen lokaal!)
npm run stack:stop
```

`stack:start` print de sleutels voor `.env.local`. Dit zijn dezelfde, publiek bekende **lokale** ontwikkelsleutels als die van de Supabase CLI.

### Overige variabelen in `.env.local`

| Variabele | Doel |
| --- | --- |
| `APP_URL` | Basis-URL voor uitnodigings- en wachtwoordlinks (`http://localhost:3000`) |
| `CRON_SECRET` | Minimaal 32 tekens; beveiligt `/api/cron/run` (genereren: `openssl rand -hex 24`) |
| `QUOTE_WEBHOOK_ENABLED` / `QUOTE_WEBHOOK_SECRET` | Offerte-webhook, standaard **uit** |
| `SEED_PASSWORD` | Wachtwoord voor de testaccounts van de ontwikkelseed (alleen lokaal) |

## 3. Ontwikkelseed (fictieve demodata)

```bash
npm run db:seed
```

Maakt ± 12 fictieve projecten in verschillende fases (wachten op klant, achterstallige taak, ontbrekende volgende actie, meerdere draaidagen, crew-overlap, video's in verschillende feedbackstatussen, een deels betaalde factuur, twee klanten met portaal) en **echte testaccounts met echte rechten**:

| Rol | E-mail |
| --- | --- |
| Eigenaar | `lars@studiobrutaal.test` |
| Medewerker / stagiaire | `stagiaire@studiobrutaal.test` |
| Freelancer met account (Joris) | `joris@freelance.test` |
| Klant A (Gemeente Rivierstad) | `klant-a@rivierstad.test` |
| Klant B (Bakkerij Korrel) | `klant-b@korrel.test` |

Wachtwoord: de waarde van `SEED_PASSWORD` (anders wordt er een willekeurig wachtwoord getoond). De seed weigert te draaien tegen een niet-lokale Supabase-URL, met `NODE_ENV=production`, of als er al projecten bestaan.

## 4. Starten

```bash
npm run dev                      # ontwikkelserver op http://localhost:3000
# of productiebuild:
npm run build && npm start
```

Klik op het woordmerk **STUDIO BRUTAAL** om altijd naar het centrale dashboard te gaan.

## 5. Eigenaar registreren (eerste keer, ook in productie)

Open registratie staat uit (`enable_signup = false`). De eerste eigenaar maak je server-side aan:

```bash
npm run owner:create -- --email lars@studiobrutaal.nl --name "Lars"
```

- Vereist `SUPABASE_SECRET_KEY` in de omgeving; dit commando draait nooit via de webapp.
- Weigert als er al een actieve eigenaar is (een bewuste tweede eigenaar: `--additional`).
- Print een eenmalige link (24 uur geldig) waarmee Lars zelf een wachtwoord kiest. Er wordt geen vast wachtwoord gezet.

### Eigenaar via het Supabase-dashboard (zonder terminal)

1. Supabase → **Authentication → Users → Add user → Create new user**: e-mail + wachtwoord, vink **Auto Confirm User** aan.
2. Supabase → **SQL Editor**: plak `supabase/snippets/eigenaar-instellen.sql`, pas het e-mailadres aan en voer uit.
3. Log in op de app.

### Inloggen lukt niet op Vercel/online?

Open **`https://<jouw-app>/status`**. Die pagina controleert (zonder sleutels te tonen): Supabase-URL en sleutels, `APP_URL`, bereikbaarheid van Supabase Auth, open registratie, of de migraties zijn toegepast, of schema `finance` is geëxposeerd en of er een eigenaar is, met per punt de oplossing. Veelvoorkomende oorzaken:

- De **testaccounts** (`lars@studiobrutaal.test` enz.) bestaan alleen in de lokale ontwikkeldatabase; online moet je de eigenaar zelf aanmaken (hierboven).
- **Migraties niet uitgevoerd** op het online Supabase-project (`npx supabase link --project-ref <ref>` + `npx supabase db push`).
- **Omgevingsvariabelen** ontbreken of zijn gewijzigd zonder nieuwe deploy. Zowel `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` als de namen van de Vercel–Supabase-koppeling (`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`) worden herkend.
- Vercel deployt de branch **`main`**; zolang de pull request niet is gemerged staat daar nog geen app. Gebruik de preview-URL van de branch of merge eerst.
- Ingelogd maar "Geen toegang": het account heeft nog geen rol (eigenaar instellen, of uitnodigen via Instellingen → Gebruikers).

## 6. Gebruikers uitnodigen en rollen testen

Als eigenaar: **Instellingen → Gebruikers en rollen → Account aanmaken**.

- Kies rol *Medewerker / stagiaire*, *Freelancer* (koppel aan een freelancerregistratie) of *Klant* (optioneel direct projecttoegang).
- Je krijgt een eenmalige uitnodigingslink die je zelf verstuurt (werkt zonder e-mailserver). Lokaal met de CLI kun je ook mails bekijken in Mailpit/Inbucket op poort 54324 (wachtwoord-vergeten-flow).
- *Toegang intrekken* werkt direct: elke databasevraag controleert de actieve rol opnieuw.
- Klanttoegang per project beheer je onder **Project → Klantportaal**.

Rollen testen: log in met de testaccounts uit stap 3 in verschillende browserprofielen. Wat elke rol hoort te zien staat in [docs/BEVEILIGING.md](docs/BEVEILIGING.md); de geautomatiseerde tests in stap 8 controleren dit ook via directe API-verzoeken.

## 7. Scheduler en automatiseringen

```bash
npm run jobs:run              # verwerkt de jobtabel eenmalig (signaalscan + wachtrij)
npm run jobs:run -- --loop    # lokaal elke 15 minuten
```

In productie roept een scheduler `POST /api/cron/run` aan met `Authorization: Bearer $CRON_SECRET` (zonder geldige configuratie geeft het endpoint 404). Zie [docs/AUTOMATISERING.md](docs/AUTOMATISERING.md). **Er is nog geen productiescheduler aangesloten.**

Offerte-events simuleren (zonder publieke webhook):

```bash
npm run quotes:simulate -- created OFF-123 "Nieuwe film" "Klant BV" 250000
npm run quotes:simulate -- accepted OFF-123
```

## 8. Tests en checks

```bash
npm run typecheck
npm run lint
npm test                      # unit-tests bedrijfsregels (geen database nodig)
npm run test:integration      # rechten en workflows tegen de echte API met echte sessies
npm run test:e2e              # Playwright: hoofdflow + formulieren (desktop en mobiel)
npm run build
```

Integratie- en e2e-tests verwachten een **verse seed** (`npm run stack:reset && npm run db:seed`, of `npx supabase db reset && npm run db:seed`) en, voor e2e, een draaiende app (`npm run build && npm start`; Playwright start die zelf als poort 3000 vrij is). Gebruik je een eigen Chromium: `PW_CHROMIUM_PATH=/pad/naar/chrome npm run test:e2e`; anders eenmalig `npx playwright install chromium`.

## 9. Projectstructuur

```
supabase/migrations/        schema, finance-schema, functies, RLS/grants, template v1
supabase/config.toml        lokale Supabase CLI-config (signup uit, finance-schema exposed)
scripts/                    seed, owner:create, jobs:run, quotes:simulate, lichte lokale stack
src/app/(staff)/            interne werkomgeving (eigenaar + medewerker)
src/app/crew/               freelancer met account
src/app/portaal/            klantportaal
src/app/api/                downloads, exports, cron, offerte-webhook
src/lib/domain/             pure bedrijfslogica (datums, aandacht, rondes, financiën, portaal)
src/lib/supabase/           server-, proxy- en admin-client
tests/unit|integration|e2e  tests
```

## 10. Gemaakte keuzes (kort)

- **Bestanden** worden (max. 10 MB) als `bytea` in Postgres bewaard en alleen via geautoriseerde routes gedownload (`Cache-Control: no-store`). Grote bestanden deel je als link (Drive, WeTransfer, Frame.io). Later kan dit naar Supabase Storage met private buckets.
- **Financiën** staan in een apart schema `finance` met alleen-eigenaar-RLS. Bij een gehost project moet `finance` bij *Settings → API → Exposed schemas* staan.
- **Datums**: kalenderdatums zonder tijd zijn `date`; tijdstippen `timestamptz`; planning en weekgrenzen in Europe/Amsterdam, week begint op maandag.
- **Geld**: integer eurocenten, exclusief btw; btw apart.
- **Templates**: de gekozen versie wordt bij projectaanmaak gekopieerd; gepubliceerde versies zijn onveranderlijk (databasetrigger).
- **Volgende actie** wordt nooit automatisch gekozen; een afgeronde volgende actie geeft een melding om een nieuwe te kiezen.
- **Meldingen** zijn alleen in-app; er gaan geen automatische externe berichten uit.
- **shadcn/ui**: de componenten zijn in shadcn-stijl handmatig opgenomen (Radix + Tailwind) omdat de shadcn-registry in de bouwomgeving niet bereikbaar was.
