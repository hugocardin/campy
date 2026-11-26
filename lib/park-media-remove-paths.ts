const DEFAULT_CHUNK = 100;

export type RemoveChunkOutcome = {
  ok: boolean;
  /**
   * Optional exact paths deleted by the backend. When omitted on success,
   * the helper falls back to the full requested chunk (counter semantics).
   */
  removedPaths?: readonly string[];
};

export type RemovePathsChunkResult = {
  removed: number;
  notRemoved: number;
  /** Audit sample source: preferred callback paths, else successful chunk. */
  removedPaths: string[];
};

function isUnsafeObjectPath(path: string): boolean {
  if (!path) return true;
  // Segment check: allow names like `photo..jpg`, block traversal `../x`.
  return path.split("/").includes("..");
}

/**
 * Chunked path remove with an injectable per-chunk callback (unit-testable).
 * Unsafe paths (empty or `..` segment) count as `notRemoved` and are warned.
 */
export async function removePathsInChunks(
  paths: readonly string[],
  removeChunk: (chunk: readonly string[]) => Promise<RemoveChunkOutcome>,
  chunkSize: number = DEFAULT_CHUNK,
  warn: (...args: unknown[]) => void = console.warn,
): Promise<RemovePathsChunkResult> {
  let removed = 0;
  let notRemoved = 0;
  const removedPaths: string[] = [];
  const size = chunkSize > 0 ? chunkSize : DEFAULT_CHUNK;

  const unsafe = paths.filter(
    (p) => typeof p !== "string" || isUnsafeObjectPath(p),
  );
  const safe = paths.filter(
    (p): p is string => typeof p === "string" && !isUnsafeObjectPath(p),
  );

  if (unsafe.length > 0) {
    notRemoved += unsafe.length;
    warn(
      "[park-media] skipped unsafe object paths",
      `count=${unsafe.length}`,
      `sample=${JSON.stringify(unsafe.slice(0, 5))}`,
    );
  }

  for (let i = 0; i < safe.length; i += size) {
    const chunk = safe.slice(i, i + size);
    try {
      const outcome = await removeChunk(chunk);
      if (!outcome.ok) {
        notRemoved += chunk.length;
        continue;
      }
      // Counters: whole chunk counts as removed (already-gone paths included).
      removed += chunk.length;
      // Prefer exact backend names when provided (incl. empty); else fall back.
      if (outcome.removedPaths !== undefined) {
        removedPaths.push(...outcome.removedPaths);
      } else {
        removedPaths.push(...chunk);
      }
    } catch (err) {
      warn("[park-media] remove chunk threw", err);
      notRemoved += chunk.length;
    }
  }

  return { removed, notRemoved, removedPaths };
}
