/**
 * Normalize client IP into a shared Photon rate-limit bucket key.
 * IPv6 → /64 (expand `::` first); IPv4-mapped → plain IPv4.
 * Unparseable / spoofed values share `photon:ip:invalid` (do not echo raw).
 */

const HEXTET_RE = /^[0-9a-f]{1,4}$/;
const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
/** Shared bucket for garbage / unparseable client-IP headers (#39 review). */
export const PHOTON_INVALID_CLIENT_KEY = "photon:ip:invalid";

function isHextet(group: string): boolean {
  return HEXTET_RE.test(group);
}

function parseIpv4(addr: string): string | null {
  return IPV4_RE.test(addr) ? addr : null;
}

/** Strip a trailing `:port` from a dotted-quad (some proxies send `a.b.c.d:port`). */
function stripIpv4Port(value: string): string {
  const m = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);
  if (!m) return value;
  const port = Number(m[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return value;
  return m[1] ?? value;
}

function expandIpv6Hextets(ip: string): string[] | null {
  const bare = ip.split("%")[0]?.trim().toLowerCase() ?? "";
  if (!bare.includes(":")) return null;

  // IPv4-mapped / IPv4-compatible trailing dotted quad.
  const v4Tail = bare.match(/:(\d{1,3}(?:\.\d{1,3}){3})$/);
  let core = bare;
  let mappedV4: string | null = null;
  if (v4Tail) {
    mappedV4 = v4Tail[1] ?? null;
    core = bare.slice(0, -((mappedV4?.length ?? 0) + 1));
  }

  const sides = core.split("::");
  if (sides.length > 2) return null;

  const left = sides[0] ? sides[0].split(":").filter(Boolean) : [];
  const right = sides.length === 2 && sides[1]
    ? sides[1].split(":").filter(Boolean)
    : [];

  if (![...left, ...right].every(isHextet)) return null;

  // Dotted-quad tail consumes two hextets.
  const target = mappedV4 ? 6 : 8;
  const fill = target - left.length - right.length;
  if (fill < 0) return null;

  const hextets = [
    ...left,
    ...Array.from({ length: fill }, () => "0"),
    ...right,
  ];

  if (mappedV4) {
    const octets = mappedV4.split(".").map((o) => Number(o));
    if (
      octets.length !== 4 ||
      octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)
    ) {
      return null;
    }
    const [a, b, c, d] = octets as [number, number, number, number];
    hextets.push(((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
  }

  if (hextets.length !== 8) return null;
  if (!hextets.every(isHextet)) return null;
  return hextets.map((h) => h.replace(/^0+(?=\w)/, "") || "0");
}

/** Expand and return the /64 prefix string (first 4 hextets), or null. */
export function ipv6Network64(ip: string): string | null {
  const hextets = expandIpv6Hextets(ip);
  if (!hextets) return null;
  return hextets.slice(0, 4).join(":");
}

/**
 * Bucket key for Photon rate limiting.
 * - IPv4 → `photon:ip:<addr>`
 * - IPv4-mapped IPv6 → same as the embedded IPv4
 * - other IPv6 → `photon:ip:<first-4-hextets>:/64`
 * - unparseable → `photon:ip:invalid`
 */
export function photonClientBucketKey(clientIp: string | null): string | null {
  if (!clientIp) return null;
  const trimmed = clientIp.trim();
  if (!trimmed) return null;

  // IPv4 with optional `:port` (no brackets) — strip port before keying.
  const maybeV4 = stripIpv4Port(trimmed);
  if (!maybeV4.includes(":")) {
    const v4 = parseIpv4(maybeV4);
    return v4 ? `photon:ip:${v4}` : PHOTON_INVALID_CLIENT_KEY;
  }

  // Bracketed IPv6 with optional port: [2001:db8::1]:443
  const bracketed = trimmed.match(/^\[([^\]]+)\](?::\d{1,5})?$/);
  const ipv6Candidate = bracketed?.[1] ?? trimmed;

  const hextets = expandIpv6Hextets(ipv6Candidate);
  if (!hextets) {
    return PHOTON_INVALID_CLIENT_KEY;
  }
  // ::ffff:a.b.c.d → treat as IPv4 (same bucket as plain IPv4).
  if (
    hextets[0] === "0" &&
    hextets[1] === "0" &&
    hextets[2] === "0" &&
    hextets[3] === "0" &&
    hextets[4] === "0" &&
    hextets[5] === "ffff"
  ) {
    const hi = parseInt(hextets[6] ?? "0", 16);
    const lo = parseInt(hextets[7] ?? "0", 16);
    const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
    return `photon:ip:${v4}`;
  }
  return `photon:ip:${hextets.slice(0, 4).join(":")}:/64`;
}
