import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMPGROUND_COVER_PLACEHOLDER,
  campgroundCoverObjectPath,
  campgroundMediaPathPrefix,
  coerceSitePhotoEntries,
  isParkMediaMime,
  isParkMediaPublicUrl,
  normalizeParkMediaUrl,
  normalizeSitePhotoUrls,
  parkMediaObjectPathFromPublicUrl,
  parkMediaPublicUrl,
  parkMediaUrlMatchesPrefix,
  resolveCampgroundCoverSrc,
  sitePhotoObjectPath,
  sitePhotoPathPrefix,
  sniffParkMediaMime,
} from "./park-media";

const PROJECT = "https://exampleproj.supabase.co"; // pragma: allowlist secret

describe("park-media helpers", () => {
  it("maps mime → extension and object paths", () => {
    assert.equal(isParkMediaMime("image/jpeg"), true);
    assert.equal(isParkMediaMime("image/gif"), false);
    assert.equal(
      campgroundCoverObjectPath("cg-1", "obj", "image/png"),
      "cg-1/cover/obj.png",
    );
    assert.equal(
      sitePhotoObjectPath("cg-1", "site-2", "obj", "image/webp"),
      "cg-1/sites/site-2/obj.webp",
    );
  });

  it("sniffs magic bytes for jpeg/png/webp", () => {
    assert.equal(
      sniffParkMediaMime(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0)),
      "image/jpeg",
    );
    assert.equal(
      sniffParkMediaMime(
        Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      ),
      "image/png",
    );
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    assert.equal(sniffParkMediaMime(webp), "image/webp");
    assert.equal(sniffParkMediaMime(Uint8Array.of(0x00, 0x01)), null);
  });

  it("builds and validates public URLs for this project", () => {
    const path = "cg-1/cover/abc.jpg";
    const url = parkMediaPublicUrl(path, PROJECT);
    assert.equal(
      url,
      `${PROJECT}/storage/v1/object/public/park-media/cg-1/cover/abc.jpg`,
    );
    assert.equal(isParkMediaPublicUrl(url, PROJECT), true);
    assert.equal(parkMediaObjectPathFromPublicUrl(url, PROJECT), path);
    assert.equal(
      parkMediaUrlMatchesPrefix(url, "cg-1/cover/", PROJECT),
      true,
    );
    assert.equal(
      parkMediaUrlMatchesPrefix(url, "other/cover/", PROJECT),
      false,
    );
  });

  it("rejects foreign hosts, other buckets, path traversal, and bad encoding", () => {
    assert.equal(
      isParkMediaPublicUrl(
        "https://evil.example/storage/v1/object/public/park-media/x.jpg",
        PROJECT,
      ),
      false,
    );
    assert.equal(
      isParkMediaPublicUrl(
        `${PROJECT}/storage/v1/object/public/other-bucket/x.jpg`,
        PROJECT,
      ),
      false,
    );
    assert.equal(
      isParkMediaPublicUrl(
        `${PROJECT}/storage/v1/object/public/park-media/../secret.jpg`,
        PROJECT,
      ),
      false,
    );
    assert.equal(
      isParkMediaPublicUrl(
        `${PROJECT}/storage/v1/object/public/park-media/abc%E0%A4%A.jpg`,
        PROJECT,
      ),
      false,
    );
    assert.equal(
      parkMediaObjectPathFromPublicUrl(
        `${PROJECT}/storage/v1/object/public/park-media/abc%.jpg`,
        PROJECT,
      ),
      null,
    );
    assert.equal(normalizeParkMediaUrl("javascript:alert(1)", PROJECT), null);
    assert.equal(normalizeParkMediaUrl("  ", PROJECT), null);
  });

  it("resolves cover placeholder when empty", () => {
    assert.equal(
      resolveCampgroundCoverSrc(null, PROJECT),
      CAMPGROUND_COVER_PLACEHOLDER,
    );
    assert.equal(
      resolveCampgroundCoverSrc("", PROJECT),
      CAMPGROUND_COVER_PLACEHOLDER,
    );
    const real = parkMediaPublicUrl("a/cover/b.jpg", PROJECT);
    assert.equal(resolveCampgroundCoverSrc(real, PROJECT), real);
  });

  it("filters site photo arrays for display but coerce preserves foreign strings", () => {
    const good = parkMediaPublicUrl("a/sites/b/c.jpg", PROJECT);
    assert.deepEqual(
      normalizeSitePhotoUrls(
        [good, "https://evil/x.jpg", null, 1, ""],
        PROJECT,
      ),
      [good],
    );
    assert.deepEqual(
      coerceSitePhotoEntries([good, "https://evil/x.jpg", null, 1, "  "]),
      [good, "https://evil/x.jpg"],
    );
  });

  it("builds campground / site storage prefixes for delete cleanup", () => {
    assert.equal(campgroundMediaPathPrefix("cg-1"), "cg-1/");
    assert.equal(sitePhotoPathPrefix("cg-1", "site-2"), "cg-1/sites/site-2/");
  });

});
