// Fixed-window login throttle. In-memory and per-process: it resets on redeploy
// and would allow 2x the limit across two Railway replicas. Adequate for a small
// team tool — the point is to stop online guessing of a short shared password.

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;
const MAX_KEYS = 1000;

const buckets = new Map<string, { count: number; resetAt: number }>();

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}

export function checkRateLimit(key: string): boolean {
  const now = Date.now();

  // Keys come from a client-supplied header, so bound the map.
  if (buckets.size > MAX_KEYS) sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (bucket.count >= MAX_ATTEMPTS) return false;

  bucket.count++;
  return true;
}
