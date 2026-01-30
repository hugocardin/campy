"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export function useUserRole() {
  const [roleName, setRoleName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setRoleName(null);
        setIsLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select(`role_name:user_roles ( code )`)
        .eq("id", user.id)
        .maybeSingle();

      if (error || !profile) {
        console.error("Failed to fetch role:", error);
        setRoleName(null);
      } else {
        // @ts-expect-error — types are loose because of the join; improve later with generated types
        setRoleName(profile.role_name.code ?? null);
      }

      setIsLoading(false);
    };

    fetchRole();
  }, []);

  return { roleName, isLoading };
}
