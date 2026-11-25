const DEFAULT_CHUNK = 100;

export type RemovePathsChunkResult = {
  removed: number;
  notRemoved: number;
  /** Paths from chunks that completed without error (audit / sample source). */
  removedPaths: string[];
};

/**
 * Chunked path remove with an injectable per-chunk callback (unit-testable).
 * Paths containing `..` or empty are skipped and never counted as removed.
 */
export async function removePathsInChunks(
  paths: readonly string[],
  removeChunk: (chunk: readonly string[]) => Promise<{ ok: boolean }>,
  chunkSize: number = DEFAULT_CHUNK,
): Promise<RemovePathsChunkResult> {
  let removed = 0;
  let notRemoved = 0;
  const removedPaths: string[] = [];
  const safe = paths.filter((p) => p && !p.includes(".."));
  const size = chunkSize > 0 ? chunkSize : DEFAULT_CHUNK;

  for (let i = 0; i < safe.length; i += size) {
    const chunk = safe.slice(i, i + size);
    try {
      const { ok } = await removeChunk(chunk);
      if (!ok) {
        notRemoved += chunk.length;
        continue;
      }
      removed += chunk.length;
      removedPaths.push(...chunk);
    } catch {
      notRemoved += chunk.length;
    }
  }

  return { removed, notRemoved, removedPaths };
}
