// Genereert de lokale anon- en service_role-sleutels (HS256) uit de dev-JWT-secret.
import { createHmac } from "node:crypto";
const secret = process.env.JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function sign(payload) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
const exp = 1983812996;
const anon = sign({ iss: "supabase-demo", role: "anon", exp });
const service = sign({ iss: "supabase-demo", role: "service_role", exp });
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("\nLokale stack draait. Zet in .env.local:\n");
  console.log(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${process.env.GATEWAY_PORT ?? 54321}`);
  console.log(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${anon}`);
  console.log(`SUPABASE_SECRET_KEY=${service}`);
}
