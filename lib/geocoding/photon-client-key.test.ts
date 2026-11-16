import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ipv6Network64,
  photonClientBucketKey,
} from "./photon-client-key";

describe("photonClientBucketKey", () => {
  it("keys IPv4 as-is", () => {
    assert.equal(photonClientBucketKey("1.2.3.4"), "photon:ip:1.2.3.4");
  });

  it("expands compressed IPv6 before taking /64", () => {
    assert.equal(ipv6Network64("2001:db8::abcd:1234"), "2001:db8:0:0");
    assert.equal(
      photonClientBucketKey("2001:db8::abcd:1234"),
      "photon:ip:2001:db8:0:0:/64",
    );
    assert.equal(
      photonClientBucketKey("2001:db8::1"),
      "photon:ip:2001:db8:0:0:/64",
    );
  });

  it("unwraps IPv4-mapped IPv6 to the same bucket as plain IPv4", () => {
    assert.equal(
      photonClientBucketKey("::ffff:1.2.3.4"),
      "photon:ip:1.2.3.4",
    );
    assert.equal(
      photonClientBucketKey("0:0:0:0:0:ffff:102:304"),
      "photon:ip:1.2.3.4",
    );
  });

  it("returns null for empty", () => {
    assert.equal(photonClientBucketKey(null), null);
    assert.equal(photonClientBucketKey("  "), null);
  });
});
