import { ActionResult } from "@/entities/action-result";
import { UserProfileNoRole } from "@/entities/user-profile";
import { USER_ROLE_OWNER } from "@/lib/constants";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { supabaseAdmin } from "@/lib/supabase/admin_server";

type ProfileWithRoleNameRow = {
  id: string;
  full_name: string | null;
  email: string;
};

function toDomain(row: ProfileWithRoleNameRow): UserProfileNoRole {
  return {
    id: row.id,
    full_name: (row.full_name ?? "").trim(),
    email: (row.email ?? "").trim(),
  };
}

export const getOwners = async (): Promise<
  ActionResult<UserProfileNoRole[]>
> => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, user_roles!inner(code)")
      .eq("user_roles.code", USER_ROLE_OWNER);

    if (error) {
      return pgerrorToActionResultError(error);
    }

    const ownerProfiles = data.map(toDomain);

    return {
      success: true,
      data: ownerProfiles,
    };
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }
};
