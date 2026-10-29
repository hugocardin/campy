"use server";

import { redirect } from "@/i18n/navigation";
import { ActionResult, resultError, resultSuccess } from "@/lib/errors";
import { revalidateLocalizedPath } from "@/lib/revalidate-localized-path";
import { routes } from "@/lib/routes";
import { toSafeInternalHref } from "@/lib/safe-internal-href";
import { mapAuthError } from "@/lib/supabase/auth-utils";
import { handleAuthResponse } from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { AUTH_MODES, AuthMode } from "@/lib/types/auth";
import { getLocale } from "next-intl/server";

async function finishAuthenticatedRedirect(redirectTo: string): Promise<never> {
  // Refresh the whole localized tree so auth-dependent UI can update after
  // soft navigation; Header also syncs via getSession on pathname change.
  revalidateLocalizedPath("/", "layout");

  const locale = await getLocale();
  return redirect({
    href: toSafeInternalHref(redirectTo),
    locale,
  });
}

export async function authAction(
  mode: AuthMode,
  email: string,
  password: string,
  redirectTo: string = routes.profile(),
): Promise<ActionResult<void>> {
  const supabase = await createClient();

  if (mode === AUTH_MODES.SIGNIN) {
    const result = await handleAuthResponse(() =>
      supabase.auth.signInWithPassword({ email, password }),
    );

    if (!result.success) {
      return result;
    }

    return finishAuthenticatedRedirect(redirectTo);
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return resultError(mapAuthError(error));
  }

  // Email confirmation disabled → immediate session; treat like sign-in.
  if (data.session) {
    return finishAuthenticatedRedirect(redirectTo);
  }

  // Confirmation required → stay on the form and show "check your email".
  return resultSuccess();
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    // Surface to the client so Header can toast instead of assuming revoke worked.
    throw new Error(error.message);
  }

  revalidateLocalizedPath("/", "layout");

  const locale = await getLocale();
  return redirect({ href: routes.home(), locale });
}
