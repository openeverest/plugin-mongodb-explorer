// The backend wraps errors in `{"error":"…"}`, sometimes around a downstream
// `{"message":"…"}`; peel them so the UI never shows raw JSON.
export function extractErrorMessage(raw: string): string {
  let msg = (raw ?? '').trim();
  if (!msg) return '';

  const unwrap = (s: string): string => {
    try {
      const parsed: unknown = JSON.parse(s);
      if (parsed && typeof parsed === 'object') {
        const inner = 'message' in parsed ? parsed.message : 'error' in parsed ? parsed.error : undefined;
        if (typeof inner === 'string') return inner.trim();
      }
    } catch {
      // Not JSON — keep as is.
    }
    return s;
  };

  for (let i = 0; i < 3; i++) {
    const next = unwrap(msg);
    if (next === msg) break;
    msg = next;
  }
  const embedded = msg.match(/\{[^{}]*"message"\s*:\s*"([^"]+)"[^{}]*\}/);
  return embedded ? embedded[1].trim() : msg;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
