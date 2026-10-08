/** Alleen http(s)-links; weigert javascript:, data:, file: e.d. Spiegelt app_private.is_safe_url. */
export function isSafeUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  if (value.length > 2000 || /\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}

export function isVimeoUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "vimeo.com" || host.endsWith(".vimeo.com");
  } catch {
    return false;
  }
}
