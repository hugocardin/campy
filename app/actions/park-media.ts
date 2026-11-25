"use server";

import {
  ActionResult,
  CommonErrorCode,
  DbErrorCode,
  resultError,
  resultSuccess,
} from "@/lib/errors";
import {
  campgroundCoverObjectPath,
  isParkMediaMime,
  normalizeParkMediaUrl,
  normalizeSitePhotoUrls,
  PARK_MEDIA_BUCKET,
  PARK_MEDIA_MAX_BYTES,
  PARK_MEDIA_MAX_SITE_PHOTOS,
  parkMediaObjectPathFromPublicUrl,
  parkMediaPublicUrl,
  sitePhotoObjectPath,
} from "@/lib/park-media";
import { revalidateLocalizedPath } from "@/lib/revalidate-localized-path";
import { routes } from "@/lib/routes";
import { isUuid } from "@/lib/is-uuid";
import {
  handleDbSingle,
  handleUnexpectedError,
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
  | { ok: true; file: File; mime: "image/jpeg" | "image/png" | "image/webp" }
  | { ok: false; error: ActionResult }
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
      error: resultError(CommonErrorCode.COMMON_FIELD_TOO_LONG, {
        field: "file",
        maxBytes: PARK_MEDIA_MAX_BYTES,
      }),
    };
  }
  const mime = raw.type;
  if (!isParkMediaMime(mime)) {
    return {
      ok: false,
      error: resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
        field: "file",
        reason: "mime",
      }),
    };
  }
  return { ok: true, file: raw, mime };
}

async function removeStorageObjectIfOurs(
  publicUrl: string | null | undefined,
): Promise<void> {
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
  if (!fileResult.ok) {
    return fileResult.error as ActionResult<{ coverPhoto: string }>;
  }

  try {
    const supabase = await createClient();

    const existing = await handleDbSingle(
      supabase
        .from("campgrounds")
        .select("id, cover_photo")
        .eq("id", campgroundId)
        .single(),
    );
    if (!existing.success) {
      return existing as ActionResult<{ coverPhoto: string }>;
    }

    const objectPath = campgroundCoverObjectPath(
      campgroundId,
      randomUUID(),
      fileResult.mime,
    );

    const { error: uploadError } = await supabase.storage
      .from(PARK_MEDIA_BUCKET)
      .upload(objectPath, fileResult.file, {
        contentType: fileResult.mime,
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("[park-media] cover upload failed", uploadError.message);
      return resultError(DbErrorCode.DB_UNHANDLED_DATABASE_ERROR, {
        reason: "storage_upload",
      });
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
      await removeStorageObjectIfOurs(publicUrl);
      return update;
    }

    const previous = normalizeParkMediaUrl(
      (existing.data as { cover_photo?: string | null }).cover_photo,
    );
    if (previous && previous !== publicUrl) {
      await removeStorageObjectIfOurs(previous);
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

    if (previous) await removeStorageObjectIfOurs(previous);

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
  if (!fileResult.ok) {
    return fileResult.error as ActionResult<{ photos: string[] }>;
  }

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
    if (!existing.success) {
      return existing as ActionResult<{ photos: string[] }>;
    }

    const current = normalizeSitePhotoUrls(
      (existing.data as { photos?: unknown }).photos,
    );
    if (current.length >= PARK_MEDIA_MAX_SITE_PHOTOS) {
      return resultError(CommonErrorCode.COMMON_FIELD_TOO_LONG, {
        field: "photos",
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
      .upload(objectPath, fileResult.file, {
        contentType: fileResult.mime,
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("[park-media] site upload failed", uploadError.message);
      return resultError(DbErrorCode.DB_UNHANDLED_DATABASE_ERROR, {
        reason: "storage_upload",
      });
    }

    const publicUrl = parkMediaPublicUrl(objectPath);
    const nextPhotos = [...current, publicUrl];

    const update = await handleDbSingle(
      supabase
        .from("sites")
        .update({
          photos: nextPhotos,
          updated_at: new Date().toISOString(),
        })
        .eq("id", siteId)
        .eq("campground_id", campgroundId)
        .select("id, photos")
        .single(),
    );

    if (!update.success) {
      await removeStorageObjectIfOurs(publicUrl);
      return update;
    }

    revalidateSiteMedia(campgroundId, siteId);
    return resultSuccess({
      photos: normalizeSitePhotoUrls(
        (update.data as { photos?: unknown }).photos,
      ),
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

  const target = normalizeParkMediaUrl(photoUrl);
  if (!target) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "photoUrl",
    });
  }

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

    const current = normalizeSitePhotoUrls(
      (existing.data as { photos?: unknown }).photos,
    );
    if (!current.includes(target)) {
      return resultError(DbErrorCode.DB_NOT_FOUND, { field: "photoUrl" });
    }

    const nextPhotos = current.filter((url) => url !== target);

    const update = await handleDbSingle(
      supabase
        .from("sites")
        .update({
          photos: nextPhotos,
          updated_at: new Date().toISOString(),
        })
        .eq("id", siteId)
        .eq("campground_id", campgroundId)
        .select("id, photos")
        .single(),
    );
    if (!update.success) return update;

    await removeStorageObjectIfOurs(target);

    revalidateSiteMedia(campgroundId, siteId);
    return resultSuccess({
      photos: normalizeSitePhotoUrls(
        (update.data as { photos?: unknown }).photos,
      ),
    });
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
