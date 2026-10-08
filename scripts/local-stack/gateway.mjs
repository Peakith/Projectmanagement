// Minimale vervanger van de Supabase API-gateway (Kong) voor de lichte lokale stack.
// /auth/v1/* -> Supabase Auth, /rest/v1/* -> PostgREST. Vereist een geldige apikey,
// net als Kong. Niet bedoeld voor productie.
import http from "node:http";
import { sign } from "./keys.mjs";

const port = Number(process.env.GATEWAY_PORT ?? 54321);
const upstreams = {
  "/auth/v1": Number(process.env.GOTRUE_PORT ?? 54331),
  "/rest/v1": Number(process.env.POSTGREST_PORT ?? 54332),
};
const exp = 1983812996;
const validKeys = new Set([
  sign({ iss: "supabase-demo", role: "anon", exp }),
  sign({ iss: "supabase-demo", role: "service_role", exp }),
]);

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, prefer, accept-profile, content-profile, range, x-supabase-api-version",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-expose-headers": "content-range, x-total-count",
};

http
  .createServer((req, res) => {
    if (req.url === "/health") return res.writeHead(200).end("ok");
    if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
    const prefix = Object.keys(upstreams).find((p) => req.url?.startsWith(p + "/") || req.url === p);
    if (!prefix) return res.writeHead(404, cors).end(JSON.stringify({ message: "not found" }));
    const url = new URL(req.url, "http://x");
    const apikey = req.headers.apikey ?? url.searchParams.get("apikey");
    if (!apikey || !validKeys.has(String(apikey))) {
      return res.writeHead(401, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ message: "Invalid API key" }));
    }
    const headers = { ...req.headers };
    if (!headers.authorization) headers.authorization = `Bearer ${apikey}`;
    delete headers.host;
    const upstream = http.request(
      { host: "127.0.0.1", port: upstreams[prefix], path: req.url.slice(prefix.length) || "/", method: req.method, headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, { ...up.headers, ...cors });
        up.pipe(res);
      },
    );
    upstream.on("error", (e) => res.writeHead(502, cors).end(JSON.stringify({ message: e.message })));
    req.pipe(upstream);
  })
  .listen(port, "127.0.0.1", () => console.log(`gateway op :${port}`));
