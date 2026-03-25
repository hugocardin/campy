import { UserProfileNoRole } from "@/entities/user-profile";
import { USER_ROLE_OWNER } from "@/lib/constants";
import { ActionResult, resultSuccess } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase/admin_server";
import {
  handleDbResponse,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";

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
    const result = await handleDbResponse(
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, user_roles!inner(code)")
        .eq("user_roles.code", USER_ROLE_OWNER),
    );

    if (!result.success) {
      return result;
    }

    const ownerProfiles = result.data.map(toDomain);

    return resultSuccess(ownerProfiles);
  } catch (err) {
    return handleUnexpectedError(err);
  }
};
