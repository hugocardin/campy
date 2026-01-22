import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { getUserProfile } from "@/data/profile/get-profile";

export default async function ProfilePage() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    return (
      <div className="p-8 text-center">
        <p className="text-xl text-foreground">
          Please sign in to view your profile.
        </p>
      </div>
    );
  }

  const profile = await getUserProfile(clerkUser.id);

  return (
    <main className="p-6 md:p-8 max-w-3xl mx-auto min-h-[calc(100vh- theme(spacing.16))]">
      <h1 className="text-3xl md:text-4xl font-bold mb-8 text-foreground">
        Your Profile
      </h1>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Header section with UserButton */}
        <div className="p-6 md:p-8 border-b border-border bg-linear-to-r from-primary/10 to-background">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="shrink-0">
              <UserButton afterSignOutUrl="/" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-foreground truncate">
                {clerkUser.firstName} {clerkUser.lastName}
              </h2>
              <p className="mt-1 text-muted-foreground">
                {clerkUser.emailAddresses[0].emailAddress}
              </p>
            </div>
          </div>
        </div>

        {/* Details section */}
        <div className="p-6 md:p-8">
          <h3 className="text-xl font-semibold mb-6 text-foreground">
            Saved Information
          </h3>

          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Full Name
              </dt>
              <dd className="mt-1 text-lg font-medium text-foreground">
                {profile.full_name}
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Email (Database)
              </dt>
              <dd className="mt-1 text-lg font-medium text-foreground">
                {profile.email}
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Role
              </dt>
              <dd className="mt-1 text-lg font-medium text-foreground">
                {profile.role_name}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </main>
  );
}
