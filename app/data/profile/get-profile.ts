import { UserProfile } from "@/app/entities/user-profile";
import { createClient } from "@/lib/supabase/server";

type ProfileWithRoleNameRow = {
  full_name: string | null;
  email: string | null;
  role_name: { code: string };
};

function toDomain(row: ProfileWithRoleNameRow, userId: string): UserProfile {
  return {
    id: userId,
    role_name: row.role_name.code,
    full_name: (row.full_name ?? "").trim(),
    email: (row.email ?? "").trim(),
  };
}

export const getUserProfile = async (
  userId: string,
): Promise<UserProfile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      `
        full_name, email,
        role_name:user_roles ( code )
        `,
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load user profile:", error.message);
    throw error;
  }

  if (!data) {
    return null;
  }

  // @ts-expect-error — types are loose because of the join; improve later with generated types
  return toDomain(data, userId);
};
