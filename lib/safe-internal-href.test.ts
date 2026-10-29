import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routes } from "./routes";
import { toSafeInternalHref } from "./safe-internal-href";

describe("toSafeInternalHref", () => {
  it("allows relative app paths and strips locale", () => {
    assert.equal(toSafeInternalHref("/profile"), "/profile");
    assert.equal(toSafeInternalHref("/en-CA/profile"), "/profile");
    assert.equal(
      toSafeInternalHref("/fr-CA/platformAdmin/campgrounds"),
      "/platformAdmin/campgrounds",
    );
    assert.equal(
      toSafeInternalHref("/en-CA/profile?tab=bookings"),
      "/profile?tab=bookings",
    );
  });

  it("rejects open redirects", () => {
    assert.equal(toSafeInternalHref("https://evil.example"), routes.profile());
    assert.equal(toSafeInternalHref("//evil.example"), routes.profile());
    assert.equal(toSafeInternalHref("/\\evil.example"), routes.profile());
    assert.equal(toSafeInternalHref("evil.example"), routes.profile());
    assert.equal(toSafeInternalHref(""), routes.profile());
    assert.equal(toSafeInternalHref(undefined), routes.profile());
    assert.equal(toSafeInternalHref("/en-CA//evil.example"), routes.profile());
    assert.equal(toSafeInternalHref("/fr-CA/\\evil.example"), routes.profile());
    assert.equal(toSafeInternalHref("/\tevil.example"), routes.profile());
  });

  it("rejects auth self-redirects", () => {
    assert.equal(toSafeInternalHref("/auth"), routes.profile());
    assert.equal(toSafeInternalHref("/en-CA/auth"), routes.profile());
    assert.equal(toSafeInternalHref("/auth?x=1"), routes.profile());
  });
});
