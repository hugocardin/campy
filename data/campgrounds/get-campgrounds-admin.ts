import { CampgroundAdmin } from "@/entities/campground-admin";
import {
  GUEST_PRICE_CURRENCY,
  resolveCampgroundPriceCurrency,
} from "@/lib/campground-price";
import { ActionResult, DbErrorCode, resultError, resultSuccess } from "@/lib/errors";
import { normalizeParkMediaUrl } from "@/lib/park-media";
import {
  handleDbResponse,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

type CampgroundAdminRow = {
  id: string;
  owner_id: string;
  owner_full_name: string;
  owner_email: string;
  name: string;
  description: string;
  address: string;
  city: string;
  province: string;
  country: string;
  currency: string | null;
  latitude: number;
  longitude: number;
  website: string | null;
  phone: string | null;
  active: boolean;
  commission_type_id?: number | null;
  commission_value?: number | string | null;
  /** From `v_campgrounds_admin` join on `commission_types`. */
  commission_type_name?: string | null;
  cover_photo?: string | null;
};

function toDomain(row: CampgroundAdminRow): CampgroundAdmin {
  const typeId =
    row.commission_type_id == null ? null : Number(row.commission_type_id);
  const resolvedTypeId =
    typeId != null && Number.isInteger(typeId) && typeId > 0 ? typeId : null;
  const rawValue = row.commission_value;
  const valueNum =
    rawValue == null || rawValue === "" ? 0 : Number(rawValue);
  const rawTypeName = row.commission_type_name?.trim().toLowerCase() ?? "";

  return {
    id: row.id,
    owner_id: row.owner_id,
    owner_full_name: row.owner_full_name,
    owner_email: row.owner_email,
    name: row.name,
    description: row.description,
    address: row.address,
    city: row.city,
    province: row.province,
    country: row.country,
    currency: resolveCampgroundPriceCurrency(
      row.currency ?? GUEST_PRICE_CURRENCY,
    ),
    location: {
      lat: Number(row.latitude),
      lng: Number(row.longitude),
    },
    website: row.website ?? "",
    phone: row.phone ?? "",
    active: row.active,
    commission_type_id: resolvedTypeId,
    commission_type_name:
      resolvedTypeId != null && rawTypeName !== "" ? rawTypeName : null,
    commission_value: Number.isFinite(valueNum) ? valueNum : 0,
    coverPhoto: normalizeParkMediaUrl(row.cover_photo),
  };
}

/**
 * Platform-admin catalog via SECURITY DEFINER RPC (direct SELECT on
 * v_campgrounds_admin is revoked from anon/authenticated).
 */
export const getCampgroundsAdmin = cache(
  async (): Promise<ActionResult<CampgroundAdmin[]>> => {
    try {
      const supabase = await createClient();

      const result = await handleDbResponse(
        supabase.rpc("get_campgrounds_admin"),
      );

      if (!result.success) {
        return result;
      }

      const campgrounds = (result.data as CampgroundAdminRow[]).map(toDomain);

      return resultSuccess(campgrounds);
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);

export const getCampgroundAdminById = cache(
  async (id: string): Promise<ActionResult<CampgroundAdmin>> => {
    try {
      const supabase = await createClient();

      const result = await handleDbResponse(
        supabase.rpc("get_campgrounds_admin", { p_id: id }),
      );

      if (!result.success) {
        return result;
      }

      const rows = result.data as CampgroundAdminRow[];
      if (!rows.length) {
        return resultError(DbErrorCode.DB_NOT_FOUND);
      }

      return resultSuccess(toDomain(rows[0]!));
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);
