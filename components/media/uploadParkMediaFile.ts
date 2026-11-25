"use client";

import {
  CommonErrorCode,
  MediaErrorCode,
  type ErrorCode,
} from "@/lib/errors";
import {
  PARK_MEDIA_BUCKET,
  PARK_MEDIA_MAX_BYTES,
  campgroundCoverObjectPath,
  parkMediaMaxMb,
  parkMediaObjectPathFromPublicUrl,
  parkMediaPublicUrl,
  sitePhotoObjectPath,
  sniffParkMediaMime,
  type ParkMediaMime,
} from "@/lib/park-media";
import { createClient } from "@/lib/supabase/client";

export type ParkMediaClientUploadResult =
  | { ok: true; publicUrl: string; mime: ParkMediaMime }
  | {
      ok: false;
      errorCode: ErrorCode;
      details?: Record<string, unknown>;
    };

async function prepareUpload(
  file: File,
): Promise<
  | { ok: true; bytes: Uint8Array; mime: ParkMediaMime }
  | {
      ok: false;
      errorCode: ErrorCode;
      details?: Record<string, unknown>;
    }
> {
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      errorCode: CommonErrorCode.COMMON_MISSING_FIELD,
      details: { field: "file" },
    };
  }
  if (file.size > PARK_MEDIA_MAX_BYTES) {
    return {
      ok: false,
      errorCode: MediaErrorCode.MEDIA_FILE_TOO_LARGE,
      details: { mb: parkMediaMaxMb() },
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffParkMediaMime(bytes);
  if (!mime) {
    return {
      ok: false,
      errorCode: MediaErrorCode.MEDIA_UNSUPPORTED_TYPE,
    };
  }
  return { ok: true, bytes, mime };
}

async function uploadPrepared(
  objectPath: string,
  bytes: Uint8Array,
  mime: ParkMediaMime,
): Promise<ParkMediaClientUploadResult> {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(PARK_MEDIA_BUCKET)
    .upload(objectPath, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    console.error("[park-media] browser upload failed", error.message);
    return { ok: false, errorCode: MediaErrorCode.MEDIA_STORAGE_FAILED };
  }

  return {
    ok: true,
    publicUrl: parkMediaPublicUrl(objectPath),
    mime,
  };
}

/**
 * Best-effort delete of a park-media public URL from the browser session.
 * Harmless if the server already removed the object (or it was never ours).
 */
export async function removeParkMediaPublicUrlBestEffort(
  publicUrl: string,
): Promise<void> {
  const path = parkMediaObjectPathFromPublicUrl(publicUrl);
  if (!path) return;
  try {
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(PARK_MEDIA_BUCKET)
      .remove([path]);
    if (error) {
      console.warn("[park-media] browser remove failed", error.message);
    }
  } catch (err) {
    console.warn("[park-media] browser remove threw", err);
  }
}

/** Upload a campground cover directly to Storage (browser session + RLS). */
export async function uploadCampgroundCoverFile(
  campgroundId: string,
  file: File,
): Promise<ParkMediaClientUploadResult> {
  const prepared = await prepareUpload(file);
  if (!prepared.ok) return prepared;

  const objectPath = campgroundCoverObjectPath(
    campgroundId,
    crypto.randomUUID(),
    prepared.mime,
  );
  return uploadPrepared(objectPath, prepared.bytes, prepared.mime);
}

/** Upload a site photo directly to Storage (browser session + RLS). */
export async function uploadSitePhotoFile(
  campgroundId: string,
  siteId: string,
  file: File,
): Promise<ParkMediaClientUploadResult> {
  const prepared = await prepareUpload(file);
  if (!prepared.ok) return prepared;

  const objectPath = sitePhotoObjectPath(
    campgroundId,
    siteId,
    crypto.randomUUID(),
    prepared.mime,
  );
  return uploadPrepared(objectPath, prepared.bytes, prepared.mime);
}
