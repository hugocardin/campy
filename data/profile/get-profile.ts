import { ActionResult } from "@/entities/action-result";
import { UserProfile } from "@/entities/user-profile";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
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
    const { data, error } = await supabase
      .from("profiles")
      .select(
        `
        full_name, email,
        role_name:user_roles ( code )
        `,
      )
      .eq("id", userId)
      .single();

    if (error) {
      return pgerrorToActionResultError(error);
    }

    // @ts-expect-error — types are loose because of the join; improve later with generated types
    const userProfile = toDomain(data, userId);

    return {
      success: true,
      data: userProfile,
    };
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }
};
