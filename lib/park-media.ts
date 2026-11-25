/**
 * Park media (Phase C): Supabase Storage bucket `park-media` + URL helpers.
 *
 * Paths:
 * - cover: `{campgroundId}/cover/{uuid}.{ext}`
 * - site:  `{campgroundId}/sites/{siteId}/{uuid}.{ext}`
 */

export const PARK_MEDIA_BUCKET = "park-media" as const;

/** Existing guest card placeholder when `cover_photo` is empty. */
export const CAMPGROUND_COVER_PLACEHOLDER =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop" as const;

export const PARK_MEDIA_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB (matches bucket)
export const PARK_MEDIA_MAX_SITE_PHOTOS = 12;

export const PARK_MEDIA_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ParkMediaMime = (typeof PARK_MEDIA_ALLOWED_MIME)[number];

const MIME_TO_EXT: Record<ParkMediaMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isParkMediaMime(value: string): value is ParkMediaMime {
  return (PARK_MEDIA_ALLOWED_MIME as readonly string[]).includes(value);
}

export function extensionForParkMediaMime(mime: ParkMediaMime): string {
  return MIME_TO_EXT[mime];
}

/** Object path for a new campground cover upload. */
export function campgroundCoverObjectPath(
  campgroundId: string,
  objectId: string,
  mime: ParkMediaMime,
): string {
  return `${campgroundId}/cover/${objectId}.${extensionForParkMediaMime(mime)}`;
}

/** Object path for a new site photo upload. */
export function sitePhotoObjectPath(
  campgroundId: string,
  siteId: string,
  objectId: string,
  mime: ParkMediaMime,
): string {
  return `${campgroundId}/sites/${siteId}/${objectId}.${extensionForParkMediaMime(mime)}`;
}

/**
 * Build the public object URL for a path in `park-media`.
 * Uses the project URL from env (server or public).
 */
export function parkMediaPublicUrl(
  objectPath: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): string {
  const base = supabaseUrl.replace(/\/$/, "");
  const encoded = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/storage/v1/object/public/${PARK_MEDIA_BUCKET}/${encoded}`;
}

/**
 * True when `url` is a public object URL for this project's `park-media` bucket.
 * Rejects other hosts / buckets so DB columns cannot point at arbitrary images.
 */
export function isParkMediaPublicUrl(
  url: string | null | undefined,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): boolean {
  if (!url || !supabaseUrl) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  let parsed: URL;
  let expectedOrigin: string;
  try {
    parsed = new URL(trimmed);
    expectedOrigin = new URL(supabaseUrl).origin;
  } catch {
    return false;
  }

  if (parsed.origin !== expectedOrigin) return false;
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const prefix = `/storage/v1/object/public/${PARK_MEDIA_BUCKET}/`;
  if (!parsed.pathname.startsWith(prefix)) return false;

  const objectPath = decodeURIComponent(parsed.pathname.slice(prefix.length));
  if (!objectPath || objectPath.includes("..")) return false;
  return true;
}

/** Extract Storage object path from a park-media public URL, or null. */
export function parkMediaObjectPathFromPublicUrl(
  url: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): string | null {
  if (!isParkMediaPublicUrl(url, supabaseUrl)) return null;
  const parsed = new URL(url.trim());
  const prefix = `/storage/v1/object/public/${PARK_MEDIA_BUCKET}/`;
  return decodeURIComponent(parsed.pathname.slice(prefix.length));
}

/**
 * Normalize a DB cover/photo URL for display: keep only park-media public URLs.
 * Empty / foreign / unsafe → null (caller shows placeholder).
 */
export function normalizeParkMediaUrl(
  raw: string | null | undefined,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return isParkMediaPublicUrl(trimmed, supabaseUrl) ? trimmed : null;
}

/** Cover URL for guest UI: real park-media URL or the Unsplash placeholder. */
export function resolveCampgroundCoverSrc(
  coverPhoto: string | null | undefined,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): string {
  return (
    normalizeParkMediaUrl(coverPhoto, supabaseUrl) ??
    CAMPGROUND_COVER_PLACEHOLDER
  );
}

/** Filter a sites.photos array down to valid park-media URLs (order preserved). */
export function normalizeSitePhotoUrls(
  photos: unknown,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): string[] {
  if (!Array.isArray(photos)) return [];
  const out: string[] = [];
  for (const item of photos) {
    if (typeof item !== "string") continue;
    const safe = normalizeParkMediaUrl(item, supabaseUrl);
    if (safe) out.push(safe);
  }
  return out;
}
