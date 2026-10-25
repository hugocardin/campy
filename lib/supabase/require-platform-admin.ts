import { getUserRoleName } from "@/data/users/get-user-role";
import { USER_ROLE_PLATEFORMADMIN } from "@/lib/constants";
import {
  ActionResult,
  DbErrorCode,
  resultError,
  resultSuccess,
} from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type PlatformAdminContext = {
  userId: string;
};

/**
 * Ensures the current session belongs to a platform_admin.
 * Call at the top of every platform-admin Server Action.
 */
export async function requirePlatformAdmin(): Promise<
  ActionResult<PlatformAdminContext>
> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return resultError(DbErrorCode.DB_SESSION_EXPIRED);
  }

  const roleResult = await getUserRoleName(user.id);

  if (
    !roleResult.success ||
    roleResult.data !== USER_ROLE_PLATEFORMADMIN
  ) {
    return resultError(DbErrorCode.DB_PERMISSION_DENIED);
  }

  return resultSuccess({ userId: user.id });
}
