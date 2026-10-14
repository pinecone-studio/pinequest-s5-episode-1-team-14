// Тодорхой хугацаанд хэт олон оролдлого хийсэн түлхүүрийг (IP) түр хаана.
// ponytail: санах ойд хадгална; нэг backend процесст л ажиллана.
export function createAttemptLimiter(max: number, windowMs: number, now = () => Date.now()) {
  const attempts = new Map<string, { count: number; since: number }>();
  const current = (key: string) => {
    const entry = attempts.get(key);
    if (entry && now() - entry.since > windowMs) attempts.delete(key);
    return attempts.get(key);
  };
  return {
    allowed: (key: string) => (current(key)?.count ?? 0) < max,
    fail(key: string) {
      const entry = current(key) ?? { count: 0, since: now() };
      attempts.set(key, { ...entry, count: entry.count + 1 });
    },
  };
}
