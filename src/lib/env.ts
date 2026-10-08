/**
 * Omgevingsvariabelen. Ondersteunt zowel de nieuwe Supabase-namen (publishable/secret key)
 * als de namen die de Vercel–Supabase-koppeling zet (anon/service role key).
 */
export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}
export function supabasePublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}
export function supabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Omgevingsvariabele ${name} ontbreekt. Zie .env.example of /status.`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl());
  },
  get supabaseKey() {
    return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (of NEXT_PUBLIC_SUPABASE_ANON_KEY)", supabasePublicKey());
  },
  get appUrl() {
    return (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, "");
  },
};
