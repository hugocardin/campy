"use server";

import { ProfileUpdateInput } from "@/entities/profile_update_input";
import { redirect } from "@/i18n/navigation";
import {
  ActionResult,
  CommonErrorCode,
  DbErrorCode,
  resultError,
} from "@/lib/errors";
import {
  FULL_NAME_MAX_LENGTH,
  normalizePersonName,
} from "@/lib/profile-validation";
import { revalidateLocalizedPath } from "@/lib/revalidate-localized-path";
import { routes } from "@/lib/routes";
import { normalizeStoredRigLengthFeet } from "@/lib/site-rig-length";
import {
  handleDbSingle,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";

/**
 * Update the signed-in user's own profile (`full_name`, `default_rig_length`).
 * Rig length is stored in feet; metres conversion happens at the form edge.
 * Email / role_id stay server-owned (RLS + BEFORE UPDATE trigger).
 * `updated_at` is set by `trg_profiles_set_updated_at` (not client-writable).
 */
export async function updateProfileAction(
  input: ProfileUpdateInput,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return resultError(DbErrorCode.DB_SESSION_EXPIRED);
    }

    // Server actions are public POSTs — validate runtime shape before methods.
    if (!input || typeof input !== "object") {
      return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
        field: "full_name",
      });
    }
    if (typeof input.full_name !== "string") {
      return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
        field: "full_name",
      });
    }
    if (
      !(
        input.default_rig_length === null ||
        typeof input.default_rig_length === "number"
      )
    ) {
      return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
        field: "default_rig_length",
      });
    }

    const fullName = normalizePersonName(input.full_name);
    if (!fullName) {
      return resultError(CommonErrorCode.COMMON_MISSING_FIELD, {
        field: "full_name",
      });
    }
    if (fullName.length > FULL_NAME_MAX_LENGTH) {
      return resultError(CommonErrorCode.COMMON_FIELD_TOO_LONG, {
        field: "full_name",
      });
    }

    let defaultRigLength: number | null = null;
    if (input.default_rig_length != null) {
      const parsed = normalizeStoredRigLengthFeet(input.default_rig_length);
      if (!parsed.ok) {
        return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
          field: "default_rig_length",
        });
      }
      defaultRigLength = parsed.feet;
    }

    // Column UPDATE grant is allow-listed (full_name, default_rig_length, …).
    // Do not set updated_at — trigger trg_profiles_set_updated_at owns it.
    const result = await handleDbSingle(
      supabase
        .from("profiles")
        .update({
          full_name: fullName,
          default_rig_length: defaultRigLength,
        })
        .eq("id", user.id)
        .select("id")
        .single(),
    );

    if (!result.success) {
      return result;
    }

    revalidateLocalizedPath(routes.profile());
    revalidateLocalizedPath(routes.profileEdit());
  } catch (err) {
    return handleUnexpectedError(err);
  }

  const locale = await getLocale();
  return redirect({
    href: routes.profile(),
    locale,
  });
}
