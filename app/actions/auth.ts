"use server";

import { ActionResult, resultSuccess } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { handleAuthResponse } from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type AuthMode = "signin" | "signup";

export async function authAction(
  mode: AuthMode,
  email: string,
  password: string,
  redirectTo: string = routes.profile(),
): Promise<ActionResult<void>> {
  const supabase = await createClient();

  let result: ActionResult<void>;

  if (mode === "signin") {
    result = await handleAuthResponse(() =>
      supabase.auth.signInWithPassword({ email, password }),
    );
  } else {
    result = await handleAuthResponse(() =>
      supabase.auth.signUp({ email, password }),
    );
  }

  if (!result.success) {
    return result;
  }

  if (mode === "signup") {
    return resultSuccess();
  }

  // For signin → redirect to the initial page
  revalidatePath("/");
  redirect(redirectTo);
}
