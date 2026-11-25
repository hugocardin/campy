import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PARK_MEDIA_BUCKET } from "@/lib/park-media";

const LIST_PAGE = 100;
const REMOVE_CHUNK = 100;

function folderFromPrefix(prefix: string): string {
  return prefix.replace(/\/+$/, "");
}

/**
 * Recursively list object paths under a bucket folder prefix
 * (e.g. `{campgroundId}/` or `{campgroundId}/sites/{siteId}/`).
 * Best-effort: logs and returns what was collected if a page fails.
 */
export async function listParkMediaObjectPaths(
  supabase: SupabaseClient,
  prefix: string,
): Promise<string[]> {
  const root = folderFromPrefix(prefix);
  const paths: string[] = [];

  async function walk(folder: string): Promise<void> {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(PARK_MEDIA_BUCKET)
        .list(folder, {
          limit: LIST_PAGE,
          offset,
          sortBy: { column: "name", order: "asc" },
        });

      if (error) {
        console.warn(
          "[park-media] storage list failed",
          folder || "(root)",
          error.message,
        );
        return;
      }
      if (!data || data.length === 0) break;

      for (const item of data) {
        if (!item.name || item.name.includes("..")) continue;
        const child = folder ? `${folder}/${item.name}` : item.name;
        // Folders: id/metadata null. Files: non-null id.
        const isFolder = item.id == null;
        if (isFolder) {
          await walk(child);
        } else {
          paths.push(child);
        }
      }

      if (data.length < LIST_PAGE) break;
      offset += LIST_PAGE;
    }
  }

  await walk(root);
  return paths;
}

/**
 * Best-effort delete of every object under `prefix`.
 * Never throws — failures are logged. Safe to call after a successful row delete.
 */
export async function removeParkMediaByPrefix(
  supabase: SupabaseClient,
  prefix: string,
): Promise<void> {
  const trimmed = typeof prefix === "string" ? prefix.trim() : "";
  if (!trimmed || trimmed === "/" || trimmed.includes("..")) {
    console.warn("[park-media] refuse storage prefix remove", prefix);
    return;
  }

  let paths: string[];
  try {
    paths = await listParkMediaObjectPaths(supabase, trimmed);
  } catch (err) {
    console.warn("[park-media] storage prefix list threw", err);
    return;
  }

  if (paths.length === 0) return;

  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    try {
      const { error } = await supabase.storage
        .from(PARK_MEDIA_BUCKET)
        .remove(chunk);
      if (error) {
        console.warn(
          "[park-media] storage prefix remove failed",
          trimmed,
          error.message,
          `(chunk ${i / REMOVE_CHUNK + 1})`,
        );
      }
    } catch (err) {
      console.warn("[park-media] storage prefix remove threw", err);
    }
  }
}

/**
 * Best-effort remove of specific object paths (orphan sweep).
 * Returns how many remove calls reported success vs failure.
 */
export async function removeParkMediaObjectPaths(
  supabase: SupabaseClient,
  paths: readonly string[],
): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  const safe = paths.filter((p) => p && !p.includes(".."));

  for (let i = 0; i < safe.length; i += REMOVE_CHUNK) {
    const chunk = safe.slice(i, i + REMOVE_CHUNK);
    try {
      const { data, error } = await supabase.storage
        .from(PARK_MEDIA_BUCKET)
        .remove(chunk);
      if (error) {
        console.warn(
          "[park-media] orphan sweep remove failed",
          error.message,
          `(chunk ${i / REMOVE_CHUNK + 1})`,
        );
        failed += chunk.length;
        continue;
      }
      const deleted = Array.isArray(data) ? data.length : chunk.length;
      removed += deleted;
      if (deleted < chunk.length) {
        failed += chunk.length - deleted;
      }
    } catch (err) {
      console.warn("[park-media] orphan sweep remove threw", err);
      failed += chunk.length;
    }
  }

  return { removed, failed };
}
