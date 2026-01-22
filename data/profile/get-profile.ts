import { UserProfile } from "@/entities/user-profile";
import { getSupabaseClient } from "@/lib/supabase/server";
import { cache } from "react";

type ProfileWithRoleNameRow = {
  full_name: string | null;
  email: string | null;
  role_name: { name: string }; // ← change to object | null
};

function toDomain(row: ProfileWithRoleNameRow, userId: string): UserProfile {
  return {
    id: userId,
    role_name: row.role_name.name,
    full_name: (row.full_name ?? "").trim(),
    email: (row.email ?? "").trim(),
  };
}

export const getUserProfile = cache(
  async (userId: string): Promise<UserProfile> => {
    const { data, error } = await getSupabaseClient()
      .from("profiles")
      .select(
        `
        full_name, email,
        role_name:user_roles ( name )
        `,
      )
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Failed to load user profile:", error.message);
      throw error;
    }

    if (!data) {
      throw new Error(`No profile found for user ${userId}`);
    }

    // @ts-expect-error — types are loose because of the join; improve later with generated types
    return toDomain(data, userId);
  },
);
