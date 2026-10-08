# Deploymentvoorstel

Er is **niets gepubliceerd** en er zijn geen betaalde diensten afgesloten. Dit is een voorstel.

## Diensten

| Onderdeel | Voorstel | Opmerkingen |
| --- | --- | --- |
| Database, Auth | **Supabase** (regio EU, bijv. Frankfurt) | Migraties toepassen met `npx supabase link` + `npx supabase db push`. |
| Webapp | **Vercel** (regio `fra1`) of een andere Node-host (Docker, Fly.io, Render) | Next.js 16 met Server Actions; geen edge-specifieke features nodig. |
| Scheduler | Vercel Cron, Supabase `pg_cron` + `pg_net`, of GitHub Actions | Elke 15 min `POST /api/cron/run` met Bearer `CRON_SECRET`. |
| E-mail (optioneel) | Eigen SMTP of transactionele mailprovider in Supabase Auth | Alleen voor wachtwoord-vergeten; uitnodigingen werken ook via de gekopieerde link. |

## Stappen

1. Supabase-project aanmaken (EU-regio). Onder *Authentication*: **signup uitzetten**, Site URL = productie-URL, redirect-URL `https://<app>/auth/callback`.
2. Onder *Settings → API → Exposed schemas* **`finance` toevoegen** (anders werken de financiële pagina's niet; het faalt dicht).
3. `npx supabase link --project-ref <ref>` en `npx supabase db push` (past `supabase/migrations` toe, inclusief template v1). Zonder terminal: plak `supabase/install-alles.sql` in de SQL Editor en klik Run. **Draai de seed niet in productie** (het script weigert dat ook).
4. Omgevingsvariabelen bij de host: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (geheim, alleen server), `APP_URL`, `CRON_SECRET` (≥ 32 willekeurige tekens), `QUOTE_WEBHOOK_ENABLED=false`.
5. Deploy de app; daarna lokaal met de productie-omgevingsvariabelen: `npm run owner:create -- --email lars@studiobrutaal.nl --name "Lars"` en open de getoonde link.
6. Scheduler aansluiten (zie docs/AUTOMATISERING.md) en in *Instellingen → Automatisering* controleren dat jobs draaien.
7. Optioneel: wachtwoord-vergeten-mail via eigen SMTP; standaard Supabase-mail heeft lage limieten.

## Te controleren limieten en kosten (niet beloofd gratis)

- **Supabase Free**: beperkte database-opslag (bestanden staan in Postgres; max. 10 MB per bestand — bij veel uploads groeit de database snel), projecten pauzeren na inactiviteit, geen dagelijkse back-ups met point-in-time recovery. Voor productiegebruik met klantdata is een betaald plan met back-ups aan te raden. Controleer actuele prijzen en limieten op supabase.com/pricing.
- **Vercel Hobby** is bedoeld voor niet-commercieel gebruik; voor een bedrijf is een betaald plan nodig. Cron-frequentie en functieduur verschillen per plan. Controleer vercel.com/pricing.
- **Auth-e-mail**: de ingebouwde Supabase-mailer heeft een lage verzendlimiet; voor betrouwbaarheid eigen SMTP.
- **Back-ups**: zorg voor dagelijkse back-ups (betaald plan of eigen `pg_dump`-job), zeker omdat ook financiële gegevens en documenten in de database staan.

## Later

- Bestanden naar Supabase Storage (private bucket met RLS op `storage.objects` en signed URLs) als het volume groeit.
- Tweede merk (Moviemates Studio's) is al mogelijk via *Instellingen → Merken*; aparte omgeving of multitenancy is bewust niet gebouwd.
