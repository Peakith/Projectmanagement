/**
 * Simuleert offerte-events via de echte integratieservice (geen publieke webhook nodig).
 *   npm run quotes:simulate -- created OFF-123 "Nieuwe film" "Klant BV" 250000
 *   npm run quotes:simulate -- accepted OFF-123
 */
import { randomUUID } from "node:crypto";
import { adminClient } from "./lib/script-env";
import { handleQuoteEvent } from "../src/lib/integrations/quotes";

const [kind, externalId, title, clientName, amount] = process.argv.slice(2);
if (!["created", "accepted"].includes(kind) || !externalId) {
  console.error('Gebruik: npm run quotes:simulate -- <created|accepted> <externe-id> ["titel"] ["klant"] [bedrag-in-centen]');
  process.exit(1);
}
const result = await handleQuoteEvent(adminClient(), {
  source: "simulatie",
  event_id: randomUUID(),
  type: `quote.${kind}`,
  external_id: externalId,
  data: { title, client_name: clientName, amount_cents: amount ? Number(amount) : undefined },
});
console.log(result);
