import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserProfile } from "@/app/data/profile/get-profile";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { routes } from "@/lib/routes";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(routes.auth());
  }

  let profile = await getUserProfile(user.id);

  // TODO to remove fallback, it needs to exist
  // Fallback: auto-create profile if missing
  if (!profile) {
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      role_id: 1, // default role
      email: user.email,
      // you can add defaults like full_name: user.user_metadata?.full_name || null
    });

    if (error) {
      console.error("Profile creation fallback failed:", error);
      return (
        <div className="container mx-auto py-12 px-4 text-center">
          <h2 className="text-2xl font-bold text-destructive mb-4">
            Profile setup incomplete
          </h2>
          <p className="text-muted-foreground mb-6">
            We could not create your profile automatically. Please try signing
            out and back in, or contact support.
          </p>
          <Button asChild variant="outline">
            <a href="/api/auth/signout">Sign Out</a>
          </Button>
        </div>
      );
    }

    // Re-fetch after insert
    profile = await getUserProfile(user.id);
    if (!profile) {
      redirect(routes.home());
    }
  }

  // Derive initials for avatar fallback
  const initials = profile.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : user.email?.[0]?.toUpperCase() || "?";

  return (
    <div className="container mx-auto py-6 md:py-10 px-4 sm:px-6 lg:px-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Your Profile
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage your account information and preferences
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_3fr]">
        {/* Left column: Avatar & quick info */}
        <Card className="h-fit">
          <CardHeader className="items-center text-center pb-4">
            <Avatar className="h-24 w-24 mb-4">
              {/* Add real avatar URL later: src={profile.avatar_url || undefined} */}
              <AvatarImage src={undefined} alt={profile.full_name || "User"} />
              <AvatarFallback className="text-3xl bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>

            <CardTitle className="text-2xl">
              {profile.full_name || "User"}
            </CardTitle>
            <CardDescription>{user.email}</CardDescription>

            <Badge variant="secondary" className="mt-2">
              {profile.role_name || "Member"}
            </Badge>
          </CardHeader>

          <CardContent className="text-center">
            <Button variant="outline" size="sm" className="w-full">
              Edit Profile
            </Button>
          </CardContent>
        </Card>

        {/* Right column: Details & future sections */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Basic details about your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Full Name
                </dt>
                <dd className="mt-1 text-foreground">
                  {profile.full_name || "Not set"}
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Email
                </dt>
                <dd className="mt-1 text-foreground">{user.email}</dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Role
                </dt>
                <dd className="mt-1">
                  <Badge variant="outline">
                    {profile.role_name || "Unknown"}
                  </Badge>
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Joined
                </dt>
                <dd className="mt-1 text-foreground">
                  {user.created_at
                    ? new Date(user.created_at).toLocaleDateString()
                    : "Unknown"}
                </dd>
              </div>
            </CardContent>
          </Card>

          {/* Future sections – easy to expand */}
          {/* 
          <Card>
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Dark mode, notifications, etc.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline">Change Password</Button>
            </CardContent>
          </Card>
          */}
        </div>
      </div>
    </div>
  );
}
