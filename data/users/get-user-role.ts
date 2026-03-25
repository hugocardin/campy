import { ActionResult, resultSuccess } from "@/lib/errors";
import { handleDbSingle, handleUnexpectedError } from "@/lib/supabase/db-utils";
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

    const result = await handleDbSingle(
      supabase
        .from("profiles")
        .select(`role_name:user_roles ( code )`)
        .eq("id", userId)
        .single(),
    );

    if (!result.success) {
      return result;
    }

    return resultSuccess(
      (result.data.role_name as unknown as { code: string }).code,
    );
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
