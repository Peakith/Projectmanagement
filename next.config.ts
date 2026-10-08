import type { NextConfig } from "next";

const securityHeaders = [
  // Afgeschermde pagina's nooit in gedeelde caches.
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  async headers() {
    return [{ source: "/((?!_next/static|_next/image|favicon.ico).*)", headers: securityHeaders }];
  },
};

export default nextConfig;
