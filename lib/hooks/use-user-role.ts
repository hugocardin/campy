"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

/**
 * Fetch the signed-in user's role. Pass `userId` from Header auth state so the
 * role refetches after soft-nav sign-in/sign-out (Header stays mounted).
 *
 * `roleName` is only returned when it was fetched for the current `userId`,
 * so a direct A→B user switch never paints A's role on B for a frame.
 * Cache is cleared on sign-out so a returning user cannot flash a stale role.
 */
export function useUserRole(userId: string | null | undefined) {
  const [cache, setCache] = useState<{
    userId: string;
    roleName: string | null;
  } | null>(null);

  useEffect(() => {
    let ignore = false;

    if (!userId) {
      setCache(null);
      return;
    }

    const fetchRole = async () => {
      const supabase = createClient();
      const { data: profile, error } = await supabase
        .from("profiles")
        .select(`role_name:user_roles ( code )`)
        .eq("id", userId)
        .maybeSingle();

      if (ignore) return;

      if (error || !profile) {
        console.error("Failed to fetch role:", error);
        setCache({ userId, roleName: null });
      } else {
        setCache({
          userId,
          // @ts-expect-error — types are loose because of the join; improve later with generated types
          roleName: profile.role_name.code ?? null,
        });
      }
    };

    void fetchRole();

    return () => {
      ignore = true;
    };
  }, [userId]);

  const roleName = cache?.userId === userId ? cache.roleName : null;
  const isLoading = Boolean(userId) && cache?.userId !== userId;

  return { roleName, isLoading };
}
