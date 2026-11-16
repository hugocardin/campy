import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PHOTON_INVALID_CLIENT_KEY,
  ipv6Network64,
  photonClientBucketKey,
} from "./photon-client-key";

describe("photonClientBucketKey", () => {
  it("keys IPv4 as-is", () => {
    assert.equal(photonClientBucketKey("1.2.3.4"), "photon:ip:1.2.3.4");
  });

  it("strips IPv4 :port before keying", () => {
    assert.equal(photonClientBucketKey("1.2.3.4:8080"), "photon:ip:1.2.3.4");
  });

  it("maps garbage / malformed values to a shared invalid bucket", () => {
    assert.equal(photonClientBucketKey("not-an-ip"), PHOTON_INVALID_CLIENT_KEY);
    assert.equal(photonClientBucketKey("1.2.3.4:99999"), PHOTON_INVALID_CLIENT_KEY);
    assert.equal(photonClientBucketKey("gggg::1"), PHOTON_INVALID_CLIENT_KEY);
    assert.equal(photonClientBucketKey("2001:db8:xyz::1"), PHOTON_INVALID_CLIENT_KEY);
    // Incomplete uncompressed IPv6 must not be zero-padded.
    assert.equal(photonClientBucketKey("abc:1"), PHOTON_INVALID_CLIENT_KEY);
    assert.equal(photonClientBucketKey("1:2:3:4"), PHOTON_INVALID_CLIENT_KEY);
    // Bracketed form: invalid port same as IPv4:port.
    assert.equal(
      photonClientBucketKey("[2001:db8::1]:99999"),
      PHOTON_INVALID_CLIENT_KEY,
    );
  });

  it("rejects IPv4 with leading zeros (no alternate buckets)", () => {
    assert.equal(photonClientBucketKey("01.2.3.4"), PHOTON_INVALID_CLIENT_KEY);
    assert.equal(photonClientBucketKey("1.02.3.4"), PHOTON_INVALID_CLIENT_KEY);
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
    // Mid-prefix compression — last hextet must not shift into /64.
    assert.equal(
      photonClientBucketKey("2001:db8:1::abcd"),
      "photon:ip:2001:db8:1:0:/64",
    );
    assert.notEqual(
      photonClientBucketKey("2001:db8::5:6"),
      photonClientBucketKey("2001:db8:5:6::"),
    );
  });

  it("strips IPv6 zone ids", () => {
    assert.equal(
      photonClientBucketKey("fe80::1%eth0"),
      "photon:ip:fe80:0:0:0:/64",
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
