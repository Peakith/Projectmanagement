import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleQuoteEvent, quoteEventSchema, verifySignature } from "@/lib/integrations/quotes";

/**
 * Gesigneerde offerte-webhook. Standaard UIT (QUOTE_WEBHOOK_ENABLED=false) en dan altijd 404.
 * Header: X-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 */
export async function POST(req: NextRequest) {
  const secret = process.env.QUOTE_WEBHOOK_SECRET ?? "";
  if (process.env.QUOTE_WEBHOOK_ENABLED !== "true" || secret.length < 32) return new NextResponse("Not found", { status: 404 });
  const raw = await req.text();
  if (raw.length > 20000 || !verifySignature(raw, req.headers.get("x-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = quoteEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid event" }, { status: 400 });
  try {
    const result = await handleQuoteEvent(createAdminClient(), parsed.data);
    return NextResponse.json(result);
  } catch {
    // 500 => provider probeert opnieuw; verwerking is idempotent.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
