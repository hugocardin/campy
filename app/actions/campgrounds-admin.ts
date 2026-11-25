"use server";

import { CAMPGROUND_PROVINCES_CACHE_TAG } from "@/data/campgrounds/get-campgrounds";
import { CampgroundCreateUpdateInput } from "@/entities/campground_create_update_input";
import { redirect } from "@/i18n/navigation";
import {
  normalizeCommissionInput,
  parseCampgroundCommissionGuardError,
} from "@/lib/campground-commission";
import {
  CAMPGROUND_CURRENCY_LOCKED_FIELD,
  parseCampgroundCurrencyLockError,
} from "@/lib/campground-currency-lock";
import {
  GUEST_PRICE_CURRENCY,
  parseGuestPriceCurrency,
  type GuestPriceCurrency,
} from "@/lib/campground-price";
import { ActionResult, DbErrorCode, resultError, resultSuccess } from "@/lib/errors";
import { CommonErrorCode } from "@/lib/errors/common";
import { isUuid } from "@/lib/is-uuid";
import { campgroundMediaPathPrefix } from "@/lib/park-media";
import { removeParkMediaByPrefix } from "@/lib/park-media-storage";
import { revalidateLocalizedPath } from "@/lib/revalidate-localized-path";
import { routes } from "@/lib/routes";
import { toSafeHttpUrl } from "@/lib/safe-http-url";
import { getSupabaseAdmin } from "@/lib/supabase/admin_server";
import {
  handleDbNoData,
  handleDbResponse,
  handleDbSingle,
  handleUnexpectedError,
  mapPostgrestError,
} from "@/lib/supabase/db-utils";
import { requirePlatformAdmin } from "@/lib/supabase/require-platform-admin";
import { createClient } from "@/lib/supabase/server";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { getLocale } from "next-intl/server";

/**
 * Map campground insert/update PostgREST errors → field ActionResults.
 * Order: currency lock → commission DETAIL/prefix → numeric overflow (22003)
 * → generic mapPostgrestError.
 *
 * At `commission_value numeric(8,2)`, values above COMMISSION_FIXED_MAX fail as
 * 22003 during type conversion *before* the fixed-max trigger branch runs; that
 * branch is for future column widening. Postgres also silently rounds extra
 * fraction digits (`12.345` → `12.35`); the app rejects them in
 * normalizeCommissionInput.
 */
function mapCampgroundWriteError(error: PostgrestError): ActionResult<never> {
  if (error.code === "23514") {
    const lockReason = parseCampgroundCurrencyLockError({
      message: error.message,
      details: error.details,
    });
    if (lockReason) {
      return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
        field: CAMPGROUND_CURRENCY_LOCKED_FIELD,
        reason: `currency_locked_${lockReason}`,
      });
    }
  }

  const commissionGuard = parseCampgroundCommissionGuardError({
    message: error.message,
    details: error.details,
  });
  if (commissionGuard) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: commissionGuard.field,
      reason: commissionGuard.reason,
    });
  }

  // numeric_value_out_of_range from numeric(p,s) overflow only (not integer
  // overflow / other columns). Message is Postgres: "numeric field overflow".
  if (
    error.code === "22003" &&
    /numeric field overflow/i.test(error.message)
  ) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "campground.commission_value",
      reason: "value_out_of_range",
    });
  }

  return mapPostgrestError(error);
}

function normalizeWebsiteInput(
  website: string | null | undefined,
): ActionResult<string | null> {
  const trimmed = website?.trim() ?? "";
  if (!trimmed) {
    return { success: true, data: null };
  }
  // Safety check only — persist the trimmed original (not url.toString()).
  if (!toSafeHttpUrl(trimmed)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "campground.website",
    });
  }
  return { success: true, data: trimmed };
}

/**
 * Validate listing currency. Create may omit → CAD; update / explicit junk → error
 * (never silently rewrite an existing park to CAD — #51).
 */
function normalizeListingCurrencyInput(
  currency: string | undefined | null,
  options: { defaultIfMissing: boolean },
): ActionResult<GuestPriceCurrency> {
  if (currency == null || String(currency).trim() === "") {
    if (options.defaultIfMissing) {
      return resultSuccess(GUEST_PRICE_CURRENCY);
    }
    return resultError(CommonErrorCode.COMMON_MISSING_FIELD, {
      field: "campground.currency",
    });
  }
  const parsed = parseGuestPriceCurrency(currency);
  if (!parsed) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "campground.currency",
    });
  }
  return resultSuccess(parsed);
}

function revalidateCampgroundPublicAndAdmin(id: string) {
  revalidateLocalizedPath(routes.home());
  revalidateLocalizedPath(routes.campgroundDetail(id));
  revalidateLocalizedPath(routes.platformAdmin.root());
  revalidateLocalizedPath(routes.platformAdmin.campgrounds());
  revalidateLocalizedPath(routes.platformAdmin.campgroundView(id));
  revalidateLocalizedPath(routes.platformAdmin.campgroundEdit(id));
  revalidateTag(CAMPGROUND_PROVINCES_CACHE_TAG, "max");
}

async function resolveCommissionTypeName(
  supabase: SupabaseClient,
  typeId: number | null | undefined,
): Promise<ActionResult<string | null>> {
  if (typeId == null) {
    return resultSuccess(null);
  }
  if (!Number.isInteger(typeId) || typeId < 1) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "campground.commission_type_id",
    });
  }

  const result = await handleDbSingle(
    supabase
      .from("commission_types")
      .select("name")
      .eq("id", typeId)
      .single(),
  );

  if (!result.success) {
    if (result.errorCode === DbErrorCode.DB_NOT_FOUND) {
      return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
        field: "campground.commission_type_id",
      });
    }
    return result;
  }

  const name = String(result.data.name ?? "").trim().toLowerCase();
  if (!name) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "campground.commission_type_id",
    });
  }
  return resultSuccess(name);
}

async function normalizeCommissionWrite(
  supabase: SupabaseClient,
  input: Pick<
    CampgroundCreateUpdateInput,
    "commission_type_id" | "commission_value"
  >,
): Promise<
  ActionResult<{ commission_type_id: number | null; commission_value: number }>
> {
  const typeResult = await resolveCommissionTypeName(
    supabase,
    input.commission_type_id,
  );
  if (!typeResult.success) {
    return typeResult;
  }

  const normalized = normalizeCommissionInput({
    commission_type_id: input.commission_type_id,
    commission_value: input.commission_value,
    typeName: typeResult.data,
  });
  if (!normalized.ok) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field:
        normalized.field === "commission_type_id"
          ? "campground.commission_type_id"
          : "campground.commission_value",
      reason: normalized.reason,
    });
  }
  return resultSuccess(normalized.data);
}

async function changeCampgroundStatus(
  id: string,
  activeFlagToSet: boolean,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = await createClient();

    // Explicit columns only — bare `.select()` is `select=*`, which needs
    // commission_* and fails after authenticated lost table-level SELECT.
    const result = await handleDbSingle(
      supabase
        .from("campgrounds")
        .update({ active: activeFlagToSet })
        .eq("id", id)
        .select("id, active")
        .single(),
    );

    if (!result.success) {
      return result;
    }

    revalidateCampgroundPublicAndAdmin(id);
    return { success: true, data: undefined };
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

export async function inactivateCampgroundAction(
  id: string,
): Promise<ActionResult> {
  return changeCampgroundStatus(id, false);
}

export async function activateCampgroundAction(
  id: string,
): Promise<ActionResult> {
  return changeCampgroundStatus(id, true);
}

export async function updateCampgroundAction(
  input: CampgroundCreateUpdateInput,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    if (!input.id) {
      return resultError(CommonErrorCode.COMMON_MISSING_FIELD, { field: "id" });
    }

    const websiteResult = normalizeWebsiteInput(input.website);
    if (!websiteResult.success) {
      return websiteResult;
    }
    const currencyResult = normalizeListingCurrencyInput(input.currency, {
      defaultIfMissing: false,
    });
    if (!currencyResult.success) {
      return currencyResult;
    }

    const supabase = await createClient();

    const commissionResult = await normalizeCommissionWrite(supabase, input);
    if (!commissionResult.success) {
      return commissionResult;
    }

    // Build the geography point in WKT format (Well-Known Text)
    // Format: POINT(longitude latitude)
    // SRID 4326 = WGS 84 (standard for GPS coordinates)
    const locationWKT = `POINT(${input.location.lng} ${input.location.lat})`;

    // Currency lock is enforced by DB trigger (campground_currency_lock_reason);
    // map 23514 + DETAIL → clear ActionResult. No TS pre-check (#52 review).
    // .select().single() so RLS-filtered 0-row updates surface as errors
    // instead of handleDbNoData fake-success + redirect.
    // Explicit select columns only — never bare select=* (commission_* grants).
    const { data: updated, error: updateError } = await supabase
      .from("campgrounds")
      .update({
        name: input.name,
        owner_id: input.owner_id,
        description: input.description || null,
        address: input.address || null,
        city: input.city || null,
        province: input.province || null,
        country: input.country || null,
        currency: currencyResult.data,
        website: websiteResult.data,
        phone: input.phone || null,
        commission_type_id: commissionResult.data.commission_type_id,
        commission_value: commissionResult.data.commission_value,
        updated_at: new Date().toISOString(),

        // This is the important part: convert to geography type
        location: `SRID=4326;${locationWKT}`,
      })
      .eq("id", input.id)
      .select("id")
      .single();

    if (updateError) {
      return mapCampgroundWriteError(updateError);
    }

    if (!updated) {
      return resultError(DbErrorCode.DB_NOT_FOUND);
    }

    revalidateCampgroundPublicAndAdmin(input.id);
  } catch (err) {
    return handleUnexpectedError(err);
  }

  const locale = await getLocale();
  return redirect({
    href: routes.platformAdmin.campgroundView(input.id),
    locale,
  });
}

export async function createCampgroundAction(
  input: CampgroundCreateUpdateInput,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  let newCampgroundId;

  try {
    const websiteResult = normalizeWebsiteInput(input.website);
    if (!websiteResult.success) {
      return websiteResult;
    }
    const currencyResult = normalizeListingCurrencyInput(input.currency, {
      defaultIfMissing: true,
    });
    if (!currencyResult.success) {
      return currencyResult;
    }

    const locationWKT = `POINT(${input.location.lng} ${input.location.lat})`;
    const supabase = await createClient();

    const commissionResult = await normalizeCommissionWrite(supabase, input);
    if (!commissionResult.success) {
      return commissionResult;
    }

    const { data: created, error: insertError } = await supabase
      .from("campgrounds")
      .insert({
        name: input.name.trim(),
        owner_id: input.owner_id,
        description: input.description?.trim() || null,
        address: input.address?.trim() || null,
        city: input.city?.trim() || null,
        province: input.province?.trim() || null,
        country: input.country?.trim() || null,
        currency: currencyResult.data,
        website: websiteResult.data,
        phone: input.phone?.trim() || null,
        commission_type_id: commissionResult.data.commission_type_id,
        commission_value: commissionResult.data.commission_value,
        location: `SRID=4326;${locationWKT}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      return mapCampgroundWriteError(insertError);
    }

    if (!created) {
      return resultError(DbErrorCode.DB_NOT_FOUND);
    }

    newCampgroundId = created.id;

    revalidateLocalizedPath(routes.home());
    revalidateLocalizedPath(routes.campgroundDetail(newCampgroundId));
    revalidateLocalizedPath(routes.platformAdmin.root());
    revalidateLocalizedPath(routes.platformAdmin.campgrounds());
    revalidateTag(CAMPGROUND_PROVINCES_CACHE_TAG, "max");
  } catch (err) {
    return handleUnexpectedError(err);
  }

  const locale = await getLocale();
  return redirect({
    href: routes.platformAdmin.campgroundView(newCampgroundId),
    locale,
  });
}

/**
 * Hard-delete a campground (cascades sites / amenity links). Must be inactive
 * first (cheap misclick guard). Storage under `{campgroundId}/` is cleaned
 * best-effort after the response (#57). Bookings → DB_RESOURCE_IN_USE.
 */
export async function deleteCampgroundAction(
  id: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  if (!isUuid(id)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "id",
    });
  }

  try {
    const supabase = await createClient();

    const existing = await handleDbSingle(
      supabase
        .from("campgrounds")
        .select("id, active")
        .eq("id", id)
        .single(),
    );
    if (!existing.success) return existing;
    if ((existing.data as { active?: boolean }).active) {
      return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
        reason: "must_deactivate_first",
        field: "active",
      });
    }

    const { data, error } = await supabase
      .from("campgrounds")
      .delete()
      .eq("id", id)
      .eq("active", false)
      .select("id");

    if (error) {
      if (error.code === "23503") {
        return resultError(DbErrorCode.DB_RESOURCE_IN_USE, {
          reason: "resource_in_use",
        });
      }
      return mapPostgrestError(error);
    }

    if (!data || data.length === 0) {
      return resultError(DbErrorCode.DB_NOT_FOUND, {
        reason: "not_deleted",
      });
    }

    const mediaPrefix = campgroundMediaPathPrefix(id);
    after(async () => {
      try {
        await removeParkMediaByPrefix(getSupabaseAdmin(), mediaPrefix);
      } catch (err) {
        console.warn(
          "[park-media] campground delete storage cleanup threw",
          err,
        );
      }
    });

    revalidateLocalizedPath(routes.home());
    revalidateLocalizedPath(routes.campgroundDetail(id));
    revalidateLocalizedPath(routes.platformAdmin.root());
    revalidateLocalizedPath(routes.platformAdmin.campgrounds());
    revalidateTag(CAMPGROUND_PROVINCES_CACHE_TAG, "max");

    return resultSuccess();
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

export async function updateCampgroundAmenitiesAction({
  campgroundId,
  amenityIds,
}: {
  campgroundId: string;
  amenityIds: string[];
}): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = await createClient();

    // 1. Delete existing links. 0 rows is OK (empty → empty, or first assign).
    //    A hard RLS/error still fails via handleDbNoData.
    const resultDelete = await handleDbNoData(
      supabase
        .from("campground_amenities")
        .delete()
        .eq("campground_id", campgroundId),
    );

    if (!resultDelete.success) {
      return resultDelete;
    }

    // 2. Insert new links with .select() so an RLS-blocked insert cannot
    //    report success after a quiet delete (empty amenity lists are valid).
    if (amenityIds.length > 0) {
      const inserts = amenityIds.map((amenity_id) => ({
        campground_id: campgroundId,
        amenity_id,
      }));

      const resultInsert = await handleDbResponse(
        supabase.from("campground_amenities").insert(inserts).select("amenity_id"),
      );

      if (!resultInsert.success) {
        return resultInsert;
      }

      if (resultInsert.data.length !== amenityIds.length) {
        return resultError(DbErrorCode.DB_PERMISSION_DENIED, {
          reason: "amenity_insert_incomplete",
        });
      }
    }

    revalidateCampgroundPublicAndAdmin(campgroundId);
    revalidateLocalizedPath(
      routes.platformAdmin.campgroundAmenities(campgroundId),
    );
  } catch (err) {
    return handleUnexpectedError(err);
  }

  const locale = await getLocale();
  return redirect({
    href: routes.platformAdmin.campgroundView(campgroundId),
    locale,
  });
}
