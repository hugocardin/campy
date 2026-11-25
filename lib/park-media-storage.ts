import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PARK_MEDIA_BUCKET } from "@/lib/park-media";
import { removePathsInChunks } from "@/lib/park-media-remove-paths";

const LIST_PAGE = 100;
const REMOVE_CHUNK = 100;

/**
 * Objects older than this may be treated as orphan candidates.
 * Assumes browser upload → Server Action commit finishes well within this
 * window (seconds/minutes in normal use). Same grace for admin + unattended
 * cron; do not lengthen without product sign-off.
 */
export const PARK_MEDIA_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export type ParkMediaListedObject = {
  path: string;
  createdAt: string | null;
};

export type ParkMediaListResult = {
  objects: ParkMediaListedObject[];
  /** False when a list page failed — caller must not treat the set as complete. */
  complete: boolean;
};

function folderFromPrefix(prefix: string): string {
  return prefix.replace(/\/+$/, "");
}

/**
 * Recursively list object paths under a bucket folder prefix
 * (e.g. `{campgroundId}/` or `{campgroundId}/sites/{siteId}/`).
 * Used for delete-by-prefix cleanup. Global orphan sweep uses
 * `list_orphan_park_media` (SQL) instead — see #57.
 */
export async function listParkMediaObjects(
  supabase: SupabaseClient,
  prefix: string,
): Promise<ParkMediaListResult> {
  const root = folderFromPrefix(prefix);
  const objects: ParkMediaListedObject[] = [];
  let complete = true;

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
        complete = false;
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
          objects.push({
            path: child,
            createdAt:
              typeof item.created_at === "string" ? item.created_at : null,
          });
        }
      }

      if (data.length < LIST_PAGE) break;
      offset += LIST_PAGE;
    }
  }

  await walk(root);
  return { objects, complete };
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

  let list: ParkMediaListResult;
  try {
    list = await listParkMediaObjects(supabase, trimmed);
  } catch (err) {
    console.warn("[park-media] storage prefix list threw", err);
    return;
  }

  if (!list.complete) {
    console.warn(
      "[park-media] storage prefix list incomplete; removing collected paths only",
      trimmed,
    );
  }

  const paths = list.objects.map((o) => o.path);
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
 * Paths already gone (not returned by `remove`) count as removed, not failed.
 * `removedPaths` lists only paths from chunks that completed without error.
 */
export async function removeParkMediaObjectPaths(
  supabase: SupabaseClient,
  paths: readonly string[],
): Promise<{
  removed: number;
  notRemoved: number;
  removedPaths: string[];
}> {
  let chunkIndex = 0;
  return removePathsInChunks(
    paths,
    async (chunk) => {
      chunkIndex += 1;
      try {
        const { error } = await supabase.storage
          .from(PARK_MEDIA_BUCKET)
          .remove([...chunk]);
        if (error) {
          console.warn(
            "[park-media] orphan sweep remove failed",
            error.message,
            `(chunk ${chunkIndex})`,
          );
          return { ok: false };
        }
        return { ok: true };
      } catch (err) {
        console.warn("[park-media] orphan sweep remove threw", err);
        return { ok: false };
      }
    },
    REMOVE_CHUNK,
  );
}
