"use server";

import {
  ActionResult,
  CommonErrorCode,
  DbErrorCode,
  MediaErrorCode,
  resultError,
  resultSuccess,
} from "@/lib/errors";
import {
  campgroundCoverPathPrefix,
  coerceSitePhotoEntries,
  normalizeParkMediaUrl,
  PARK_MEDIA_BUCKET,
  PARK_MEDIA_MAX_SITE_PHOTOS,
  parkMediaObjectPathFromPublicUrl,
  parkMediaUrlMatchesPrefix,
  sitePhotoPathPrefix,
} from "@/lib/park-media";
import { executeOrphanParkMediaSweep } from "@/lib/park-media-orphan-sweep-run";
import { revalidateLocalizedPath } from "@/lib/revalidate-localized-path";
import { routes } from "@/lib/routes";
import { isUuid } from "@/lib/is-uuid";
import {
  handleDbSingle,
  handleUnexpectedError,
  mapPostgrestError,
} from "@/lib/supabase/db-utils";
import { requirePlatformAdmin } from "@/lib/supabase/require-platform-admin";
import { createClient } from "@/lib/supabase/server";

const SITE_PHOTO_CAP_MARKER = "park_media_site_photos_at_cap";

/** True when supabase-js surfaced a Postgres/PostgREST SQLSTATE (not a transport drop). */
function isPostgresRejection(error: {
  code?: string;
  message?: string;
}): boolean {
  const code = error.code?.trim();
  if (!code) return false;
  // SQLSTATE is 5 alphanumeric chars (e.g. P0001, 23505, 42501).
  return /^[A-Z0-9]{5}$/i.test(code);
}

function revalidateCampgroundMedia(campgroundId: string) {
  revalidateLocalizedPath(routes.home());
  revalidateLocalizedPath(routes.campgroundDetail(campgroundId));
  revalidateLocalizedPath(routes.platformAdmin.campgroundView(campgroundId));
  revalidateLocalizedPath(routes.platformAdmin.campgroundEdit(campgroundId));
  revalidateLocalizedPath(routes.platformAdmin.campgrounds());
}

function revalidateSiteMedia(campgroundId: string, siteId: string) {
  revalidateCampgroundMedia(campgroundId);
  revalidateLocalizedPath(
    routes.platformAdmin.campgroundSiteView(campgroundId, siteId),
  );
  revalidateLocalizedPath(
    routes.platformAdmin.campgroundSiteEdit(campgroundId, siteId),
  );
  revalidateLocalizedPath(routes.platformAdmin.campgroundSites(campgroundId));
}

/** Best-effort revalidate; never fail a committed media write. */
function safeRevalidateCampgroundMedia(campgroundId: string) {
  try {
    revalidateCampgroundMedia(campgroundId);
  } catch (err) {
    console.warn("[park-media] revalidate campground threw", err);
  }
}

function safeRevalidateSiteMedia(campgroundId: string, siteId: string) {
  try {
    revalidateSiteMedia(campgroundId, siteId);
  } catch (err) {
    console.warn("[park-media] revalidate site threw", err);
  }
}

async function removeStorageObjectIfOurs(
  publicUrl: string | null | undefined,
  expectedPrefix: string,
): Promise<void> {
  if (!parkMediaUrlMatchesPrefix(publicUrl, expectedPrefix)) {
    if (publicUrl) {
      console.warn(
        "[park-media] skip storage remove — path prefix mismatch",
        expectedPrefix,
      );
    }
    return;
  }
  const path = publicUrl
    ? parkMediaObjectPathFromPublicUrl(publicUrl)
    : null;
  if (!path) return;
  try {
    const supabase = await createClient();
    const { error } = await supabase.storage
      .from(PARK_MEDIA_BUCKET)
      .remove([path]);
    if (error) {
      console.warn("[park-media] storage remove failed", error.message);
    }
  } catch (err) {
    console.warn("[park-media] storage remove threw", err);
  }
}

/**
 * Commit a browser-uploaded cover URL with optimistic concurrency.
 * `expectedCoverPhoto` must match the row's current `cover_photo` (null if empty).
 * Once the row references `publicUrl`, this action returns success even if
 * revalidation / old-object cleanup throws.
 * Client cleanup contract: delete Storage only on clean `!success` that is
 * not `MEDIA_COMMIT_UNCERTAIN` (ambiguous outcomes must not delete).
 */
export async function commitCampgroundCoverAction(
  campgroundId: string,
  publicUrl: string,
  expectedCoverPhoto: string | null,
): Promise<ActionResult<{ coverPhoto: string }>> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  if (!isUuid(campgroundId)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "campgroundId",
    });
  }

  const coverPrefix = campgroundCoverPathPrefix(campgroundId);
  const nextUrl = normalizeParkMediaUrl(publicUrl);
  if (!nextUrl || !parkMediaUrlMatchesPrefix(nextUrl, coverPrefix)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "publicUrl",
    });
  }

  const expected =
    expectedCoverPhoto == null
      ? null
      : normalizeParkMediaUrl(expectedCoverPhoto);

  if (expectedCoverPhoto != null && expected == null) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "expectedCoverPhoto",
    });
  }

  // Idempotent retry: URL already committed as the live cover.
  if (expected != null && expected === nextUrl) {
    safeRevalidateCampgroundMedia(campgroundId);
    return resultSuccess({ coverPhoto: nextUrl });
  }

  let committed = false;
  try {
    const supabase = await createClient();

    let query = supabase
      .from("campgrounds")
      .update({
        cover_photo: nextUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campgroundId);

    query =
      expected == null
        ? query.is("cover_photo", null)
        : query.eq("cover_photo", expected);

    const { data, error } = await query
      .select("id, cover_photo")
      .maybeSingle();

    if (error) {
      // Transport / ambiguous errors: re-read before deleting (lost-response).
      if (!isPostgresRejection(error)) {
        const current = await handleDbSingle(
          supabase
            .from("campgrounds")
            .select("id, cover_photo")
            .eq("id", campgroundId)
            .single(),
        );
        if (current.success) {
          const live = normalizeParkMediaUrl(
            (current.data as { cover_photo?: string | null }).cover_photo,
          );
          if (live === nextUrl) {
            committed = true;
            safeRevalidateCampgroundMedia(campgroundId);
            return resultSuccess({ coverPhoto: nextUrl });
          }
        }
        // Ambiguous — leave object for #57 sweep; client must not delete either.
        console.warn(
          "[park-media] cover update transport error; skipping delete",
          error.message,
        );
        return resultError(MediaErrorCode.MEDIA_COMMIT_UNCERTAIN);
      }
      await removeStorageObjectIfOurs(nextUrl, coverPrefix);
      return mapPostgrestError(error);
    }

    if (!data) {
      const current = await handleDbSingle(
        supabase
          .from("campgrounds")
          .select("id, cover_photo")
          .eq("id", campgroundId)
          .single(),
      );
      if (!current.success) {
        // Don't delete on a failed re-read — the UPDATE may have committed.
        console.warn(
          "[park-media] cover conflict re-read failed; skipping delete",
        );
        return resultError(MediaErrorCode.MEDIA_COMMIT_UNCERTAIN);
      }
      const live = normalizeParkMediaUrl(
        (current.data as { cover_photo?: string | null }).cover_photo,
      );
      if (live === nextUrl) {
        committed = true;
        safeRevalidateCampgroundMedia(campgroundId);
        return resultSuccess({ coverPhoto: nextUrl });
      }
      await removeStorageObjectIfOurs(nextUrl, coverPrefix);
      return resultError(MediaErrorCode.MEDIA_COVER_CONFLICT);
    }

    committed = true;

    if (expected && expected !== nextUrl) {
      try {
        await removeStorageObjectIfOurs(expected, coverPrefix);
      } catch (err) {
        console.warn("[park-media] old cover cleanup threw", err);
      }
    }

    safeRevalidateCampgroundMedia(campgroundId);
    return resultSuccess({ coverPhoto: nextUrl });
  } catch (err) {
    if (committed) {
      // Row already references nextUrl — never report failure (client must not delete).
      console.warn("[park-media] post-commit cover path threw", err);
      safeRevalidateCampgroundMedia(campgroundId);
      return resultSuccess({ coverPhoto: nextUrl });
    }
    await removeStorageObjectIfOurs(nextUrl, coverPrefix);
    return handleUnexpectedError(err);
  }
}

/**
 * Clear cover when the row still matches `expectedCoverPhoto` (optimistic).
 */
export async function clearCampgroundCoverAction(
  campgroundId: string,
  expectedCoverPhoto: string | null,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  if (!isUuid(campgroundId)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "campgroundId",
    });
  }

  const coverPrefix = campgroundCoverPathPrefix(campgroundId);
  const expected =
    expectedCoverPhoto == null
      ? null
      : normalizeParkMediaUrl(expectedCoverPhoto);

  if (expectedCoverPhoto != null && expected == null) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "expectedCoverPhoto",
    });
  }

  if (expected == null) {
    return resultSuccess();
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("campgrounds")
      .update({
        cover_photo: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campgroundId)
      .eq("cover_photo", expected)
      .select("id")
      .maybeSingle();

    if (error) return mapPostgrestError(error);

    if (!data) {
      const exists = await handleDbSingle(
        supabase.from("campgrounds").select("id").eq("id", campgroundId).single(),
      );
      if (!exists.success) return exists;
      return resultError(MediaErrorCode.MEDIA_COVER_CONFLICT);
    }

    await removeStorageObjectIfOurs(expected, coverPrefix);

    safeRevalidateCampgroundMedia(campgroundId);
    return resultSuccess();
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

/**
 * Append a browser-uploaded site photo URL via atomic RPC.
 * Soft cap uses the raw array length (including foreign entries).
 * Once the URL is in `sites.photos`, returns success even if revalidation throws.
 */
export async function appendSitePhotoAction(
  campgroundId: string,
  siteId: string,
  publicUrl: string,
): Promise<ActionResult<{ photos: string[] }>> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  if (!isUuid(campgroundId) || !isUuid(siteId)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: !isUuid(campgroundId) ? "campgroundId" : "siteId",
    });
  }

  const photoPrefix = sitePhotoPathPrefix(campgroundId, siteId);
  const nextUrl = normalizeParkMediaUrl(publicUrl);
  if (!nextUrl || !parkMediaUrlMatchesPrefix(nextUrl, photoPrefix)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "publicUrl",
    });
  }

  let committed = false;
  let committedPhotos: string[] | null = null;
  try {
    const supabase = await createClient();

    const existing = await handleDbSingle(
      supabase
        .from("sites")
        .select("id, campground_id, photos")
        .eq("id", siteId)
        .eq("campground_id", campgroundId)
        .single(),
    );
    if (!existing.success) return existing;

    const currentRaw = coerceSitePhotoEntries(
      (existing.data as { photos?: unknown }).photos,
    );

    // Idempotent retry: URL already in the array.
    if (currentRaw.includes(nextUrl)) {
      committed = true;
      committedPhotos = currentRaw;
      safeRevalidateSiteMedia(campgroundId, siteId);
      return resultSuccess({ photos: currentRaw });
    }

    if (currentRaw.length >= PARK_MEDIA_MAX_SITE_PHOTOS) {
      await removeStorageObjectIfOurs(nextUrl, photoPrefix);
      return resultError(MediaErrorCode.MEDIA_LIMIT_REACHED);
    }

    const { data, error } = await supabase.rpc("append_site_photo", {
      p_campground_id: campgroundId,
      p_site_id: siteId,
      p_photo_url: nextUrl,
    });

    if (error) {
      if (
        typeof error.message === "string" &&
        error.message.includes(SITE_PHOTO_CAP_MARKER)
      ) {
        await removeStorageObjectIfOurs(nextUrl, photoPrefix);
        return resultError(MediaErrorCode.MEDIA_LIMIT_REACHED);
      }
      if (error.code === "P0002") {
        await removeStorageObjectIfOurs(nextUrl, photoPrefix);
        return resultError(DbErrorCode.DB_NOT_FOUND);
      }
      if (!isPostgresRejection(error)) {
        // Transport / ambiguous: re-read before deleting.
        const again = await handleDbSingle(
          supabase
            .from("sites")
            .select("id, photos")
            .eq("id", siteId)
            .eq("campground_id", campgroundId)
            .single(),
        );
        if (again.success) {
          const photos = coerceSitePhotoEntries(
            (again.data as { photos?: unknown }).photos,
          );
          if (photos.includes(nextUrl)) {
            committed = true;
            committedPhotos = photos;
            safeRevalidateSiteMedia(campgroundId, siteId);
            return resultSuccess({ photos });
          }
        }
        console.warn(
          "[park-media] append_site_photo transport error; skipping delete",
          error.message,
        );
        return resultError(MediaErrorCode.MEDIA_COMMIT_UNCERTAIN);
      }
      await removeStorageObjectIfOurs(nextUrl, photoPrefix);
      return mapPostgrestError(error);
    }

    committed = true;
    committedPhotos = coerceSitePhotoEntries(data);
    safeRevalidateSiteMedia(campgroundId, siteId);
    return resultSuccess({ photos: committedPhotos });
  } catch (err) {
    if (committed) {
      console.warn("[park-media] post-commit site photo path threw", err);
      safeRevalidateSiteMedia(campgroundId, siteId);
      return resultSuccess({
        photos: committedPhotos ?? [nextUrl],
      });
    }
    await removeStorageObjectIfOurs(nextUrl, photoPrefix);
    return handleUnexpectedError(err);
  }
}

/**
 * Remove one photo URL (park-media or foreign) via atomic RPC.
 * Storage delete only runs for this site's park-media prefix.
 */
export async function removeSitePhotoAction(
  campgroundId: string,
  siteId: string,
  photoUrl: string,
): Promise<ActionResult<{ photos: string[] }>> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  if (!isUuid(campgroundId) || !isUuid(siteId)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: !isUuid(campgroundId) ? "campgroundId" : "siteId",
    });
  }

  const target = typeof photoUrl === "string" ? photoUrl.trim() : "";
  if (!target) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "photoUrl",
    });
  }

  const photoPrefix = sitePhotoPathPrefix(campgroundId, siteId);

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("remove_site_photo", {
      p_campground_id: campgroundId,
      p_site_id: siteId,
      p_photo_url: target,
    });

    if (error) {
      if (error.code === "P0002") {
        return resultError(DbErrorCode.DB_NOT_FOUND, { field: "photoUrl" });
      }
      return mapPostgrestError(error);
    }

    await removeStorageObjectIfOurs(target, photoPrefix);

    safeRevalidateSiteMedia(campgroundId, siteId);
    return resultSuccess({
      photos: coerceSitePhotoEntries(data),
    });
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

/**
 * Admin orphan sweep (#57): remove park-media objects not referenced by
 * `campgrounds.cover_photo` or `sites.photos`.
 *
 * Shares `executeOrphanParkMediaSweep` with the cron route (service-role +
 * `list_orphan_park_media`). Fail-closed listing; keyset pages capped per
 * click. Periodic schedule: `/api/cron/park-media-orphan-sweep`.
 */
export async function sweepOrphanParkMediaAction(): Promise<
  ActionResult<{
    scanned: number;
    removed: number;
    notRemoved: number;
    skippedYoung: number;
    skippedUnknownAge: number;
    hasMore: boolean;
    stoppedEarly: string | null;
  }>
> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  try {
    // Service-role after platform-admin gate (same path as cron after CRON_SECRET).
    const result = await executeOrphanParkMediaSweep();

    if (result.kind === "missing_supabase_url") {
      return resultError(MediaErrorCode.MEDIA_SWEEP_ABORTED, {
        reason: "missing_supabase_url",
      });
    }
    if (result.kind === "rpc_error") {
      return mapPostgrestError(result.error);
    }
    if (result.kind === "aborted") {
      return resultError(MediaErrorCode.MEDIA_SWEEP_ABORTED, {
        reason: result.reason,
        ...(result.unparsedCount != null
          ? { unparsedCount: result.unparsedCount }
          : {}),
      });
    }

    return resultSuccess({
      scanned: result.scanned,
      removed: result.removed,
      notRemoved: result.notRemoved,
      skippedYoung: result.skippedYoung,
      skippedUnknownAge: result.skippedUnknownAge,
      hasMore: result.hasMore,
      stoppedEarly: result.stoppedEarly,
    });
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
