import { UserProfile } from "@/entities/user-profile";
import { ActionResult, resultSuccess } from "@/lib/errors";
import { handleDbSingle, handleUnexpectedError } from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";

type ProfileWithRoleNameRow = {
  full_name: string | null;
  email: string | null;
  role_name: { code: string };
};

function toDomain(row: ProfileWithRoleNameRow, userId: string): UserProfile {
  return {
    id: userId,
    role_name: row.role_name.code,
    full_name: (row.full_name ?? "").trim(),
    email: (row.email ?? "").trim(),
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
        full_name, email,
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
