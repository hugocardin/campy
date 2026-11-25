import { timingSafeEqual } from "node:crypto";

/**
 * Authorize a cron HTTP call via `Authorization: Bearer <CRON_SECRET>`.
 * Fail-closed when the secret is unset/empty or the header does not match.
 */
export function authorizeCronRequest(
  request: Request,
  secret: string | undefined = process.env.CRON_SECRET,
): boolean {
  const expected = typeof secret === "string" ? secret.trim() : "";
  if (!expected) return false;

  const header = request.headers.get("authorization");
  if (!header) return false;

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;

  const provided = match[1]!.trim();
  if (!provided) return false;

  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
