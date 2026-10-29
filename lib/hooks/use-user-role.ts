"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

/**
 * Fetch the signed-in user's role. Pass `userId` from Header auth state so the
 * role refetches after soft-nav sign-in/sign-out (Header stays mounted).
 */
export function useUserRole(userId: string | null | undefined) {
  const [roleName, setRoleName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(userId));

  useEffect(() => {
    let ignore = false;

    if (!userId) {
      setRoleName(null);
      setIsLoading(false);
      return;
    }

    setRoleName(null);
    setIsLoading(true);

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
        setRoleName(null);
      } else {
        // @ts-expect-error — types are loose because of the join; improve later with generated types
        setRoleName(profile.role_name.code ?? null);
      }

      setIsLoading(false);
    };

    void fetchRole();

    return () => {
      ignore = true;
    };
  }, [userId]);

  return { roleName, isLoading };
}
