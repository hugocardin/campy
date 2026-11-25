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
 * Delete `candidate` only when it is not already referenced by the row.
 * Avoids wiping a live cover/photo after a successful commit + retry/conflict.
 */
async function removeUnreferencedUpload(
  candidate: string,
  expectedPrefix: string,
  isReferenced: boolean,
): Promise<void> {
  if (isReferenced) return;
  await removeStorageObjectIfOurs(candidate, expectedPrefix);
}

/**
 * Commit a browser-uploaded cover URL with optimistic concurrency.
 * `expectedCoverPhoto` must match the row's current `cover_photo` (null if empty).
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
    revalidateCampgroundMedia(campgroundId);
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
      await removeUnreferencedUpload(nextUrl, coverPrefix, false);
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
        await removeUnreferencedUpload(nextUrl, coverPrefix, false);
        return current;
      }
      const live = normalizeParkMediaUrl(
        (current.data as { cover_photo?: string | null }).cover_photo,
      );
      if (live === nextUrl) {
        // Prior attempt already committed this URL (lost response / retry).
        revalidateCampgroundMedia(campgroundId);
        return resultSuccess({ coverPhoto: nextUrl });
      }
      await removeUnreferencedUpload(nextUrl, coverPrefix, false);
      return resultError(MediaErrorCode.MEDIA_COVER_CONFLICT);
    }

    committed = true;

    if (expected && expected !== nextUrl) {
      await removeStorageObjectIfOurs(expected, coverPrefix);
    }

    revalidateCampgroundMedia(campgroundId);
    return resultSuccess({ coverPhoto: nextUrl });
  } catch (err) {
    if (!committed) {
      await removeUnreferencedUpload(nextUrl, coverPrefix, false);
    }
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

    revalidateCampgroundMedia(campgroundId);
    return resultSuccess();
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

/**
 * Append a browser-uploaded site photo URL via atomic RPC.
 * Soft cap uses the raw array length (including foreign entries).
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
      revalidateSiteMedia(campgroundId, siteId);
      return resultSuccess({ photos: currentRaw });
    }

    if (currentRaw.length >= PARK_MEDIA_MAX_SITE_PHOTOS) {
      await removeUnreferencedUpload(nextUrl, photoPrefix, false);
      return resultError(MediaErrorCode.MEDIA_LIMIT_REACHED);
    }

    const { data, error } = await supabase.rpc("append_site_photo", {
      p_campground_id: campgroundId,
      p_site_id: siteId,
      p_photo_url: nextUrl,
    });

    if (error) {
      await removeUnreferencedUpload(nextUrl, photoPrefix, false);
      if (
        typeof error.message === "string" &&
        error.message.includes(SITE_PHOTO_CAP_MARKER)
      ) {
        return resultError(MediaErrorCode.MEDIA_LIMIT_REACHED);
      }
      if (error.code === "P0002") {
        return resultError(DbErrorCode.DB_NOT_FOUND);
      }
      return mapPostgrestError(error);
    }

    committed = true;
    revalidateSiteMedia(campgroundId, siteId);
    return resultSuccess({
      photos: coerceSitePhotoEntries(data),
    });
  } catch (err) {
    if (!committed) {
      await removeUnreferencedUpload(nextUrl, photoPrefix, false);
    }
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

    revalidateSiteMedia(campgroundId, siteId);
    return resultSuccess({
      photos: coerceSitePhotoEntries(data),
    });
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
