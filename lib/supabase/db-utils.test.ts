import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PostgrestError } from "@supabase/supabase-js";
import { DbErrorCode } from "../errors";
import {
  handleUnexpectedError,
  isPostgrestError,
  mapPostgrestError,
} from "./db-utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LEAKY_KEYS = [
  "stack",
  "message",
  "hint",
  "details",
  "errno",
  "syscall",
  "hostname",
  "address",
  "port",
  "cause",
] as const;

function assertNoInternalLeak(result: unknown): void {
  const json = JSON.stringify(result);
  for (const key of LEAKY_KEYS) {
    // `details` is the ActionResult field name; only forbid nested Postgres `details`.
    if (key === "details") {
      assert.equal(
        /"details"\s*:\s*"[^"]+"/.test(json),
        false,
        `serialized result must not include Postgres details string: ${json}`,
      );
      continue;
    }
    assert.equal(
      json.includes(`"${key}"`),
      false,
      `serialized result must not include "${key}": ${json}`,
    );
  }
}

function assertSafeFailure(
  result: ReturnType<typeof handleUnexpectedError>,
  errorCode: string,
): void {
  assert.equal(result.success, false);
  if (result.success) return;

  assert.equal(result.errorCode, errorCode);
  assert.ok(result.details);
  assert.equal(Object.keys(result.details!).sort().join(","), "errorId");
  assert.match(String(result.details!.errorId), UUID_RE);
  assertNoInternalLeak(result);
}

describe("isPostgrestError", () => {
  it("accepts PostgrestError instances and plain PostgREST shapes", () => {
    assert.equal(
      isPostgrestError(
        new PostgrestError({
          message: "duplicate",
          details: "Key (name)=(x) already exists",
          hint: "",
          code: "23505",
        }),
      ),
      true,
    );
    assert.equal(
      isPostgrestError({
        code: "23505",
        message: "duplicate",
        details: "Key (name)=(x) already exists",
        hint: "",
      }),
      true,
    );
  });

  it("rejects Node-style coded errors that only have code+message", () => {
    assert.equal(
      isPostgrestError({
        code: "ECONNREFUSED",
        message: "connect ECONNREFUSED 127.0.0.1:54321",
        errno: -61,
        syscall: "connect",
        address: "127.0.0.1",
        port: 54321,
      }),
      false,
    );
  });
});

describe("handleUnexpectedError", () => {
  it("returns only a mapped code + errorId for plain Errors (no stack/message)", () => {
    const result = handleUnexpectedError(new Error("boom — secret path /tmp/x"));
    assertSafeFailure(result, DbErrorCode.DB_UNHANDLED_DATABASE_ERROR);
  });

  it("treats Node-style ECONNREFUSED as unexpected, not PostgREST", () => {
    const result = handleUnexpectedError({
      code: "ECONNREFUSED",
      message: "connect ECONNREFUSED 127.0.0.1:54321",
      errno: -61,
      syscall: "connect",
      address: "127.0.0.1",
      port: 54321,
    });
    assertSafeFailure(result, DbErrorCode.DB_UNHANDLED_DATABASE_ERROR);
  });

  it("routes real PostgREST shapes through mapPostgrestError", () => {
    const result = handleUnexpectedError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "sites_name_campground_id_key"',
      details: "Key (name, campground_id)=(A1, 3f2a…) already exists",
      hint: "",
    });
    assertSafeFailure(result, DbErrorCode.DB_DUPLICATE_VALUE);
  });
});

describe("mapPostgrestError", () => {
  it("maps known codes without spreading Postgres message/details/hint", () => {
    const result = mapPostgrestError(
      new PostgrestError({
        message:
          'duplicate key value violates unique constraint "sites_name_campground_id_key"',
        details: "Key (name, campground_id)=(A1, 3f2a…) already exists",
        hint: "Check unique indexes",
        code: "23505",
      }),
    );
    assertSafeFailure(result, DbErrorCode.DB_DUPLICATE_VALUE);
  });

  it("maps unknown PostgREST codes to DB_UNHANDLED_DATABASE_ERROR safely", () => {
    const result = mapPostgrestError(
      new PostgrestError({
        message: "Row level security prevented the request",
        details: 'policy "campgrounds_select" on table campgrounds',
        hint: "Check RLS",
        code: "PGRST999",
      }),
    );
    assertSafeFailure(result, DbErrorCode.DB_UNHANDLED_DATABASE_ERROR);
  });
});
