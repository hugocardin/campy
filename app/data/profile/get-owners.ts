import { UserProfileNoRole } from "@/app/entities/user-profile";
import { USER_ROLE_OWNER } from "@/lib/constants";
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

export const getOwners = async (): Promise<UserProfileNoRole[]> => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, user_roles!inner(code)")
    .eq("user_roles.code", USER_ROLE_OWNER);

  if (error) {
    console.error("Failed to load owners:", error.message);
    return [];
  }

  if (!data || !Array.isArray(data)) {
    console.warn("No data returned from profiles");
    return [];
  }

  return data.map(toDomain);
};
