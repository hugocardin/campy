import { ActionResult, resultSuccess } from "@/entities/action-result";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Fetches the role name from profiles → user_roles join.
 * Returns null if no profile, error, or no role found.
 */
export async function getUserRoleName(
  userId: string,
): Promise<ActionResult<string>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select(`role_name:user_roles ( code )`)
      .eq("id", userId)
      .single();

    if (error) {
      return unhandledErrortoActionResultError(error);
    }

    return resultSuccess((data.role_name as unknown as { code: string }).code);
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }
}
