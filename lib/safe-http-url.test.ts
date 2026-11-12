import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toSafeHttpUrl } from "./safe-http-url";

describe("toSafeHttpUrl", () => {
  it("returns null for empty / whitespace / non-string", () => {
    assert.equal(toSafeHttpUrl(""), null);
    assert.equal(toSafeHttpUrl("   "), null);
    assert.equal(toSafeHttpUrl(null), null);
    assert.equal(toSafeHttpUrl(undefined), null);
  });

  it("prefixes https for bare hosts", () => {
    assert.equal(toSafeHttpUrl("www.x.ca"), "https://www.x.ca/");
    assert.equal(toSafeHttpUrl("bcparks.ca"), "https://bcparks.ca/");
  });

  it("accepts host:port without treating the host as a scheme", () => {
    assert.equal(toSafeHttpUrl("x.ca:8080"), "https://x.ca:8080/");
    assert.equal(toSafeHttpUrl("localhost:3000"), "https://localhost:3000/");
  });

  it("keeps explicit http(s) schemes", () => {
    assert.equal(toSafeHttpUrl("https://parc.ca"), "https://parc.ca/");
    assert.equal(toSafeHttpUrl("HTTP://example.com/path"), "http://example.com/path");
  });

  it("rejects dangerous or non-http schemes", () => {
    assert.equal(toSafeHttpUrl("javascript:alert(1)"), null);
    assert.equal(toSafeHttpUrl(" JAVASCRIPT:alert(1)"), null);
    assert.equal(toSafeHttpUrl("data:text/html,hi"), null);
    assert.equal(toSafeHttpUrl("mailto:info@park.ca"), null);
  });

  it("rejects protocol-relative URLs", () => {
    assert.equal(toSafeHttpUrl("//x.ca"), null);
  });

  it("accepts internationalized hostnames via URL parsing", () => {
    const result = toSafeHttpUrl("https://parc-québec.ca");
    assert.ok(result);
    assert.match(result!, /^https:\/\//);
    assert.ok(result!.includes("parc-") || result!.includes("xn--"));
  });
});
