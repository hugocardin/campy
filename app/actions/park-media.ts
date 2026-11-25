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
  campgroundCoverObjectPath,
  campgroundCoverPathPrefix,
  coerceSitePhotoEntries,
  normalizeParkMediaUrl,
  normalizeSitePhotoUrls,
  PARK_MEDIA_BUCKET,
  PARK_MEDIA_MAX_BYTES,
  PARK_MEDIA_MAX_SITE_PHOTOS,
  parkMediaMaxMb,
  parkMediaObjectPathFromPublicUrl,
  parkMediaPublicUrl,
  parkMediaUrlMatchesPrefix,
  sitePhotoObjectPath,
  sitePhotoPathPrefix,
  sniffParkMediaMime,
  type ParkMediaMime,
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
import { randomUUID } from "node:crypto";

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

async function readUploadFile(
  formData: FormData,
  field = "file",
): Promise<
  | { ok: true; bytes: Uint8Array; mime: ParkMediaMime }
  | { ok: false; error: ActionResult<never> }
> {
  const raw = formData.get(field);
  if (!(raw instanceof File) || raw.size === 0) {
    return {
      ok: false,
      error: resultError(CommonErrorCode.COMMON_MISSING_FIELD, {
        field: "file",
      }),
    };
  }
  if (raw.size > PARK_MEDIA_MAX_BYTES) {
    return {
      ok: false,
      error: resultError(MediaErrorCode.MEDIA_FILE_TOO_LARGE, {
        mb: parkMediaMaxMb(),
      }),
    };
  }

  const buffer = new Uint8Array(await raw.arrayBuffer());
  const mime = sniffParkMediaMime(buffer);
  if (!mime) {
    return {
      ok: false,
      error: resultError(MediaErrorCode.MEDIA_UNSUPPORTED_TYPE),
    };
  }
  return { ok: true, bytes: buffer, mime };
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

export async function uploadCampgroundCoverAction(
  campgroundId: string,
  formData: FormData,
): Promise<ActionResult<{ coverPhoto: string }>> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  if (!isUuid(campgroundId)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "campgroundId",
    });
  }

  const fileResult = await readUploadFile(formData);
  if (!fileResult.ok) return fileResult.error;

  try {
    const supabase = await createClient();
    const coverPrefix = campgroundCoverPathPrefix(campgroundId);

    const existing = await handleDbSingle(
      supabase
        .from("campgrounds")
        .select("id, cover_photo")
        .eq("id", campgroundId)
        .single(),
    );
    if (!existing.success) return existing;

    const objectPath = campgroundCoverObjectPath(
      campgroundId,
      randomUUID(),
      fileResult.mime,
    );

    const { error: uploadError } = await supabase.storage
      .from(PARK_MEDIA_BUCKET)
      .upload(objectPath, fileResult.bytes, {
        contentType: fileResult.mime,
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("[park-media] cover upload failed", uploadError.message);
      return resultError(MediaErrorCode.MEDIA_STORAGE_FAILED);
    }

    const publicUrl = parkMediaPublicUrl(objectPath);

    const update = await handleDbSingle(
      supabase
        .from("campgrounds")
        .update({
          cover_photo: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campgroundId)
        .select("id, cover_photo")
        .single(),
    );

    if (!update.success) {
      await removeStorageObjectIfOurs(publicUrl, coverPrefix);
      return update;
    }

    const previous = normalizeParkMediaUrl(
      (existing.data as { cover_photo?: string | null }).cover_photo,
    );
    if (previous && previous !== publicUrl) {
      await removeStorageObjectIfOurs(previous, coverPrefix);
    }

    revalidateCampgroundMedia(campgroundId);
    return resultSuccess({ coverPhoto: publicUrl });
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

export async function clearCampgroundCoverAction(
  campgroundId: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  if (!isUuid(campgroundId)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "campgroundId",
    });
  }

  try {
    const supabase = await createClient();
    const coverPrefix = campgroundCoverPathPrefix(campgroundId);

    const existing = await handleDbSingle(
      supabase
        .from("campgrounds")
        .select("id, cover_photo")
        .eq("id", campgroundId)
        .single(),
    );
    if (!existing.success) return existing;

    const previous = normalizeParkMediaUrl(
      (existing.data as { cover_photo?: string | null }).cover_photo,
    );

    const update = await handleDbSingle(
      supabase
        .from("campgrounds")
        .update({
          cover_photo: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campgroundId)
        .select("id")
        .single(),
    );
    if (!update.success) return update;

    if (previous) await removeStorageObjectIfOurs(previous, coverPrefix);

    revalidateCampgroundMedia(campgroundId);
    return resultSuccess();
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

export async function uploadSitePhotoAction(
  campgroundId: string,
  siteId: string,
  formData: FormData,
): Promise<ActionResult<{ photos: string[] }>> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  if (!isUuid(campgroundId) || !isUuid(siteId)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: !isUuid(campgroundId) ? "campgroundId" : "siteId",
    });
  }

  const fileResult = await readUploadFile(formData);
  if (!fileResult.ok) return fileResult.error;

  try {
    const supabase = await createClient();
    const photoPrefix = sitePhotoPathPrefix(campgroundId, siteId);

    // Existence + soft cap check (authoritative cap is in append_site_photo).
    const existing = await handleDbSingle(
      supabase
        .from("sites")
        .select("id, campground_id, photos")
        .eq("id", siteId)
        .eq("campground_id", campgroundId)
        .single(),
    );
    if (!existing.success) return existing;

    const currentDisplay = normalizeSitePhotoUrls(
      (existing.data as { photos?: unknown }).photos,
    );
    if (currentDisplay.length >= PARK_MEDIA_MAX_SITE_PHOTOS) {
      return resultError(MediaErrorCode.MEDIA_LIMIT_REACHED, {
        max: PARK_MEDIA_MAX_SITE_PHOTOS,
      });
    }

    const objectPath = sitePhotoObjectPath(
      campgroundId,
      siteId,
      randomUUID(),
      fileResult.mime,
    );

    const { error: uploadError } = await supabase.storage
      .from(PARK_MEDIA_BUCKET)
      .upload(objectPath, fileResult.bytes, {
        contentType: fileResult.mime,
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("[park-media] site upload failed", uploadError.message);
      return resultError(MediaErrorCode.MEDIA_STORAGE_FAILED);
    }

    const publicUrl = parkMediaPublicUrl(objectPath);

    const { data, error } = await supabase.rpc("append_site_photo", {
      p_campground_id: campgroundId,
      p_site_id: siteId,
      p_photo_url: publicUrl,
      p_max: PARK_MEDIA_MAX_SITE_PHOTOS,
    });

    if (error) {
      await removeStorageObjectIfOurs(publicUrl, photoPrefix);
      if (error.code === "P0001") {
        return resultError(MediaErrorCode.MEDIA_LIMIT_REACHED, {
          max: PARK_MEDIA_MAX_SITE_PHOTOS,
        });
      }
      if (error.code === "P0002") {
        return resultError(DbErrorCode.DB_NOT_FOUND);
      }
      return mapPostgrestError(error);
    }

    revalidateSiteMedia(campgroundId, siteId);
    return resultSuccess({
      photos: normalizeSitePhotoUrls(data ?? coerceSitePhotoEntries(data)),
    });
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

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

  const photoPrefix = sitePhotoPathPrefix(campgroundId, siteId);
  const target = normalizeParkMediaUrl(photoUrl);
  if (!target || !parkMediaUrlMatchesPrefix(target, photoPrefix)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "photoUrl",
    });
  }

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
      photos: normalizeSitePhotoUrls(data ?? []),
    });
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
