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

  it("accepts plain PostgREST bodies with null details/hint", () => {
    assert.equal(
      isPostgrestError({
        code: "42501",
        message: "new row violates row-level security policy",
        details: null,
        hint: null,
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

  it("maps RLS plain JSON with null details/hint to DB_PERMISSION_DENIED", () => {
    const result = handleUnexpectedError({
      code: "42501",
      message: "new row violates row-level security policy for table \"campgrounds\"",
      details: null,
      hint: null,
    });
    assertSafeFailure(result, DbErrorCode.DB_PERMISSION_DENIED);
  });

  it("maps PGRST116 with 0-row details to DB_NOT_FOUND", () => {
    const result = mapPostgrestError({
      code: "PGRST116",
      message: "JSON object requested, multiple (or no) rows returned",
      details: "The result contains 0 rows",
      hint: null,
    } as PostgrestError);
    assertSafeFailure(result, DbErrorCode.DB_NOT_FOUND);
  });

  it("maps PGRST116 with multiple-row details to DB_UNHANDLED_DATABASE_ERROR", () => {
    const result = mapPostgrestError({
      code: "PGRST116",
      message: "JSON object requested, multiple (or no) rows returned",
      details: "The result contains 2 rows",
      hint: null,
    } as PostgrestError);
    assertSafeFailure(result, DbErrorCode.DB_UNHANDLED_DATABASE_ERROR);
  });

  it("maps PGRST116 with missing details to DB_UNHANDLED_DATABASE_ERROR", () => {
    const result = mapPostgrestError({
      code: "PGRST116",
      message: "JSON object requested, multiple (or no) rows returned",
      details: null,
      hint: null,
    } as PostgrestError);
    assertSafeFailure(result, DbErrorCode.DB_UNHANDLED_DATABASE_ERROR);
  });

  it("logs an allowlisted cause summary for fetch failures", () => {
    const logged: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };

    try {
      const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:54321"), {
        code: "ECONNREFUSED",
      });
      const err = new TypeError("fetch failed", { cause });
      const result = handleUnexpectedError(err);
      assertSafeFailure(result, DbErrorCode.DB_UNHANDLED_DATABASE_ERROR);

      assert.ok(logged.length >= 1);
      const payload = logged[0]![1] as Record<string, unknown>;
      assert.equal(payload.name, "TypeError");
      assert.equal(payload.message, "fetch failed");
      assert.deepEqual(payload.cause, {
        name: "Error",
        message: "connect ECONNREFUSED 127.0.0.1:54321",
        code: "ECONNREFUSED",
      });
      assert.equal("headers" in payload, false);
    } finally {
      console.error = original;
    }
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
