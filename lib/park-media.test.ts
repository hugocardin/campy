import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMPGROUND_COVER_PLACEHOLDER,
  campgroundCoverObjectPath,
  isParkMediaMime,
  isParkMediaPublicUrl,
  normalizeParkMediaUrl,
  normalizeSitePhotoUrls,
  parkMediaObjectPathFromPublicUrl,
  parkMediaPublicUrl,
  resolveCampgroundCoverSrc,
  sitePhotoObjectPath,
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

  it("builds and validates public URLs for this project", () => {
    const path = "cg-1/cover/abc.jpg";
    const url = parkMediaPublicUrl(path, PROJECT);
    assert.equal(
      url,
      `${PROJECT}/storage/v1/object/public/park-media/cg-1/cover/abc.jpg`,
    );
    assert.equal(isParkMediaPublicUrl(url, PROJECT), true);
    assert.equal(parkMediaObjectPathFromPublicUrl(url, PROJECT), path);
  });

  it("rejects foreign hosts, other buckets, and path traversal", () => {
    assert.equal(
      isParkMediaPublicUrl("https://evil.example/storage/v1/object/public/park-media/x.jpg", PROJECT),
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
    assert.equal(normalizeParkMediaUrl("javascript:alert(1)", PROJECT), null);
    assert.equal(normalizeParkMediaUrl("  ", PROJECT), null);
  });

  it("resolves cover placeholder when empty", () => {
    assert.equal(resolveCampgroundCoverSrc(null, PROJECT), CAMPGROUND_COVER_PLACEHOLDER);
    assert.equal(resolveCampgroundCoverSrc("", PROJECT), CAMPGROUND_COVER_PLACEHOLDER);
    const real = parkMediaPublicUrl("a/cover/b.jpg", PROJECT);
    assert.equal(resolveCampgroundCoverSrc(real, PROJECT), real);
  });

  it("filters site photo arrays", () => {
    const good = parkMediaPublicUrl("a/sites/b/c.jpg", PROJECT);
    assert.deepEqual(
      normalizeSitePhotoUrls([good, "https://evil/x.jpg", null, 1, ""], PROJECT),
      [good],
    );
  });
});
