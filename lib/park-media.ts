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

/** MiB ceiling shown in UI / MEDIA_FILE_TOO_LARGE (`{mb}`). */
export function parkMediaMaxMb(): number {
  return Math.round(PARK_MEDIA_MAX_BYTES / (1024 * 1024));
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

export function campgroundCoverPathPrefix(campgroundId: string): string {
  return `${campgroundId}/cover/`;
}

export function sitePhotoPathPrefix(
  campgroundId: string,
  siteId: string,
): string {
  return `${campgroundId}/sites/${siteId}/`;
}

/**
 * Sniff JPEG / PNG / WebP from magic bytes (ignore client-declared MIME).
 * Returns null when the bytes are not a supported image.
 */
export function sniffParkMediaMime(
  bytes: ArrayBuffer | Uint8Array,
): ParkMediaMime | null {
  const view =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  // JPEG: FF D8 FF
  if (
    view.length >= 3 &&
    view[0] === 0xff &&
    view[1] === 0xd8 &&
    view[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    view.length >= 8 &&
    view[0] === 0x89 &&
    view[1] === 0x50 &&
    view[2] === 0x4e &&
    view[3] === 0x47 &&
    view[4] === 0x0d &&
    view[5] === 0x0a &&
    view[6] === 0x1a &&
    view[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP: RIFF....WEBP
  if (
    view.length >= 12 &&
    view[0] === 0x52 &&
    view[1] === 0x49 &&
    view[2] === 0x46 &&
    view[3] === 0x46 &&
    view[8] === 0x57 &&
    view[9] === 0x45 &&
    view[10] === 0x42 &&
    view[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
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

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * True when `url` is a public object URL for this project's `park-media` bucket.
 * Rejects other hosts / buckets so DB columns cannot point at arbitrary images.
 */
export function isParkMediaPublicUrl(
  url: string | null | undefined,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): boolean {
  return parkMediaObjectPathFromPublicUrl(url ?? "", supabaseUrl) != null;
}

/** Extract Storage object path from a park-media public URL, or null. */
export function parkMediaObjectPathFromPublicUrl(
  url: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): string | null {
  if (!url || !supabaseUrl) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  let parsed: URL;
  let expectedOrigin: string;
  try {
    parsed = new URL(trimmed);
    expectedOrigin = new URL(supabaseUrl).origin;
  } catch {
    return null;
  }

  if (parsed.origin !== expectedOrigin) return null;
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const prefix = `/storage/v1/object/public/${PARK_MEDIA_BUCKET}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;

  const objectPath = safeDecodeURIComponent(
    parsed.pathname.slice(prefix.length),
  );
  if (!objectPath || objectPath.includes("..")) return null;
  return objectPath;
}

/**
 * True when a park-media public URL's object path starts with `expectedPrefix`
 * (e.g. `{campgroundId}/cover/` or `{campgroundId}/sites/{siteId}/`).
 */
export function parkMediaUrlMatchesPrefix(
  url: string | null | undefined,
  expectedPrefix: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): boolean {
  const path = url ? parkMediaObjectPathFromPublicUrl(url, supabaseUrl) : null;
  return path != null && path.startsWith(expectedPrefix);
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

/**
 * Preserve non-string / foreign URLs when writing so seed/staging values are
 * not silently deleted; display still filters via {@link normalizeSitePhotoUrls}.
 */
export function coerceSitePhotoEntries(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  const out: string[] = [];
  for (const item of photos) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}
