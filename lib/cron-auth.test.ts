import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorizeCronRequest } from "./cron-auth";

function req(authorization?: string): Request {
  const headers = new Headers();
  if (authorization != null) headers.set("authorization", authorization);
  return new Request("https://example.test/api/cron/park-media-orphan-sweep", {
    method: "GET",
    headers,
  });
}

describe("authorizeCronRequest", () => {
  it("fails closed when secret is missing or blank", () => {
    assert.equal(authorizeCronRequest(req("Bearer x"), undefined), false);
    assert.equal(authorizeCronRequest(req("Bearer x"), ""), false);
    assert.equal(authorizeCronRequest(req("Bearer x"), "   "), false);
  });

  it("rejects missing or non-Bearer Authorization", () => {
    assert.equal(authorizeCronRequest(req(), "secret"), false);
    assert.equal(authorizeCronRequest(req("Basic secret"), "secret"), false);
    assert.equal(authorizeCronRequest(req("Bearer"), "secret"), false);
  });

  it("accepts an exact Bearer match (case-insensitive scheme)", () => {
    assert.equal(authorizeCronRequest(req("Bearer secret"), "secret"), true);
    assert.equal(authorizeCronRequest(req("bearer secret"), "secret"), true);
  });

  it("rejects wrong tokens of equal or unequal length", () => {
    assert.equal(authorizeCronRequest(req("Bearer wrong1"), "secret"), false);
    assert.equal(authorizeCronRequest(req("Bearer secr"), "secret"), false);
    assert.equal(
      authorizeCronRequest(req("Bearer secret-extra"), "secret"),
      false,
    );
  });
});
