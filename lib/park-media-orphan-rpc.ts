/**
 * Parse / validate `list_orphan_park_media` RPC payloads for the admin sweep.
 * Source of truth for orphan math is SQL; this only fail-closes on bad shapes.
 */

export type OrphanParkMediaRpcResult = {
  ok?: unknown;
  reason?: unknown;
  scanned?: unknown;
  skipped_young?: unknown;
  skipped_unknown_age?: unknown;
  url_count?: unknown;
  unparsed_count?: unknown;
  has_more?: unknown;
  orphans?: unknown;
};

/** Non-negative integer, or null when the value is not a usable number. */
export function requireNonNegInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

export function parseOrphanParkMediaRpc(
  data: unknown,
): OrphanParkMediaRpcResult | null {
  if (data == null) return null;
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      return parsed && typeof parsed === "object"
        ? (parsed as OrphanParkMediaRpcResult)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof data === "object") return data as OrphanParkMediaRpcResult;
  return null;
}

/**
 * Extract candidate object paths from an ok RPC payload.
 * Returns null when the payload is not safe to delete from.
 */
export function orphanPathsFromRpcResult(
  listed: OrphanParkMediaRpcResult,
): {
  scanned: number;
  skippedYoung: number;
  skippedUnknownAge: number;
  hasMore: boolean;
  paths: string[];
} | null {
  if (listed.ok !== true) return null;

  const scanned = requireNonNegInt(listed.scanned);
  const skippedYoung = requireNonNegInt(listed.skipped_young);
  const skippedUnknownAge = requireNonNegInt(listed.skipped_unknown_age);
  if (scanned == null || skippedYoung == null || skippedUnknownAge == null) {
    return null;
  }

  if (typeof listed.has_more !== "boolean") return null;

  const orphanRows = Array.isArray(listed.orphans) ? listed.orphans : null;
  if (orphanRows == null) return null;

  const paths: string[] = [];
  for (const row of orphanRows) {
    // Harden RPC returns path strings; tolerate legacy `{ path }` objects.
    let path: unknown = row;
    if (row && typeof row === "object" && "path" in row) {
      path = (row as { path?: unknown }).path;
    }
    if (typeof path !== "string" || !path || path.includes("..")) {
      return null;
    }
    paths.push(path);
  }

  return {
    scanned,
    skippedYoung,
    skippedUnknownAge,
    hasMore: listed.has_more,
    paths,
  };
}
