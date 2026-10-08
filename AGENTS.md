<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Studio Brutaal — projectafspraken

- Interface volledig in het Nederlands; huisstijl: geel `#DFDC00` (accent, nooit witte tekst op geel), donker `#1E1E1E`, Manrope (koppen) en Overpass (tekst).
- Alle gebruikersverzoeken via `createClient()` uit `src/lib/supabase/server.ts` (sessie + RLS). De service-client (`src/lib/supabase/admin.ts`) alleen voor accountbeheer na eigenaarscheck, jobs en integraties.
- Rollen komen uit `public.user_roles` (server-side beheerd), nooit uit user metadata. Elke Server Action begint met `requireStaff()`/`requireOwner()`/`requireRole()`.
- Financiële gegevens uitsluitend in schema `finance` (RLS: alleen eigenaar). Nooit bedragen in operationele tabellen, taakteksten, activiteiten of meldingen.
- Databasewijzigingen als nieuwe migratie in `supabase/migrations/`; bestaande migraties niet aanpassen.
- Pure bedrijfslogica in `src/lib/domain/` met unit-tests in `tests/unit/`; rechten worden getest met echte sessies in `tests/integration/`.
- Checks: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:e2e`.
