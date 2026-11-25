import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { parkMediaPublicUrl } from "@/lib/park-media";
import { toCampgroundDomain } from "./to-campground-domain";

const PROJECT = "https://exampleproj.supabase.co"; // pragma: allowlist secret

const baseRow = {
  id: "cg-1",
  name: "Test Park",
  description: null,
  address: null,
  city: "Vancouver",
  province: "BC",
  country: "CA",
  currency: "CAD",
  latitude: 49.28,
  longitude: -123.12,
  website: null,
  phone: null,
  cover_photo: null as string | null,
};

describe("toCampgroundDomain cover_photo", () => {
  const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
    }
  });

  it("maps park-media cover URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT;
    const url = parkMediaPublicUrl("cg-1/cover/obj.jpg", PROJECT);
    const cg = toCampgroundDomain({ ...baseRow, cover_photo: url });
    assert.equal(cg.coverPhoto, url);
  });

  it("null cover stays null", () => {
    const cg = toCampgroundDomain({ ...baseRow, cover_photo: null });
    assert.equal(cg.coverPhoto, null);
  });

  it("non-park-media URL is rejected", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT;
    const cg = toCampgroundDomain({
      ...baseRow,
      cover_photo: "https://evil.example/x.jpg",
    });
    assert.equal(cg.coverPhoto, null);
  });
});
