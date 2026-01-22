import { getSupabaseClient } from "@/lib/supabase/server";

/**
 * Fetches the role name from profiles → user_roles join.
 * Returns null if no profile, error, or no role found.
 */
export async function getUserRoleName(
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;

  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select(`role_name:user_roles ( name )`)
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Failed to fetch user role:", error.message);
    return null;
  }

  if (!data) {
    console.warn(`No profile found for user ${userId}`);
    return null;
  }

  // @ts-expect-error — types are loose because of the join; improve later with generated types
  return (data.role_name as { name: string } | null).name;
}

/**
 * Convenience helper: checks if user has admin-level role.
 * This is what middleware will usually call.
 */
export async function isAdmin(
  userId: string | null | undefined,
): Promise<boolean> {
  const role = await getUserRoleName(userId);
  if (!role) return false;

  const allowedRoles = ["admin", "platform_admin"];
  return allowedRoles.includes(role);
}
