import { getUserProfile } from "@/data/profile/get-profile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // app/profile/page.tsx
  let profile = await getUserProfile(user.id);

  if (!profile) {
    // Auto-create minimal profile as fallback (in case trigger fails for edge reason)
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      role_id: 1, // your default
      email: user.email,
    });

    if (error) {
      console.error("Fallback profile creation failed:", error);
      // Don't redirect — show error or onboarding
      return (
        <div className="p-8 text-center">
          <h2>Profile setup incomplete</h2>
          <p>Please sign out and sign in again, or contact support.</p>
          <a href="/api/auth/signout" className="text-primary underline">
            Sign out
          </a>
        </div>
      );
    }

    // Re-fetch after insert
    profile = await getUserProfile(user.id);
    if (!profile) {
      redirect("/"); // last resort
    }
  }

  return (
    <main className="p-6 md:p-8 max-w-3xl mx-auto min-h-[calc(100vh-(--spacing(16)))]">
      <h1 className="text-3xl md:text-4xl font-bold mb-8 text-foreground">
        Your Profile
      </h1>

      <div>
        <h1>Welcome, {user.email}</h1>
        <h2>Your name is {profile.full_name}.</h2>
        <h2>Your role is {profile.role_name}.</h2>
      </div>
    </main>
  );
}
