import { NextResponse } from "next/server";

/** Zet een bytea-hexstring van PostgREST om naar een download. Altijd als bijlage en nooit cachebaar. */
export function fileResponse(hex: string, fileName: string, mime: string | null) {
  const bytes = Buffer.from(hex.startsWith("\\x") ? hex.slice(2) : hex, "hex");
  const safeName = fileName.replace(/["\\\r\n]/g, "_");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": mime && /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
