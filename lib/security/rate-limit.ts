type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  // Best-effort instance protection; the edge WAF/Supabase limits remain necessary.
  if(buckets.size>=10000){for(const [id,value] of buckets){if(value.resetAt<=now)buckets.delete(id)}if(buckets.size>=10000)return {allowed:false,remaining:0,resetAt:now+windowMs};}
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

export function getClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";

  return (
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
