import { UserProfile } from "@/entities/user-profile";
import { ActionResult, resultSuccess } from "@/lib/errors";
import { parseStoredRigLengthUnit } from "@/lib/site-rig-length";
import { handleDbSingle, handleUnexpectedError } from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";

type ProfileWithRoleNameRow = {
  full_name: string | null;
  email: string | null;
  default_rig_length: number | string | null;
  preferred_rig_unit: string | null;
  role_name: { code: string };
};

function toDefaultRigLength(
  value: number | string | null,
): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function toDomain(row: ProfileWithRoleNameRow, userId: string): UserProfile {
  return {
    id: userId,
    role_name: row.role_name.code,
    full_name: (row.full_name ?? "").trim(),
    email: (row.email ?? "").trim(),
    default_rig_length: toDefaultRigLength(row.default_rig_length),
    preferred_rig_unit: parseStoredRigLengthUnit(row.preferred_rig_unit),
  };
}

export const getUserProfile = async (
  userId: string,
): Promise<ActionResult<UserProfile>> => {
  try {
    const supabase = await createClient();

    const result = await handleDbSingle(
      supabase
        .from("profiles")
        .select(
          `
        full_name, email, default_rig_length, preferred_rig_unit,
        role_name:user_roles ( code )
        `,
        )
        .eq("id", userId)
        .single(),
    );

    if (!result.success) {
      return result;
    }

    // @ts-expect-error — types are loose because of the join; improve later with generated types
    const userProfile = toDomain(result.data, userId);

    return resultSuccess(userProfile);
  } catch (err) {
    return handleUnexpectedError(err);
  }
};
