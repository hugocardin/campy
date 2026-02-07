import { createClient } from "@/lib/supabase/server";

/**
 * Fetches the role name from profiles → user_roles join.
 * Returns null if no profile, error, or no role found.
 */
export async function getUserRoleName(
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(`role_name:user_roles ( code )`)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch user role:", error.message);
    return null;
  }

  if (!data) {
    console.error("Failed to find user");
    return null;
  }

  // @ts-expect-error — types are loose because of the join; improve later with generated types
  return (data.role_name as { code: string } | null).code;
}
