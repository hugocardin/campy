import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_id")
    .eq("id", clerkUser.id)
    .single();

  // Adjust 4 → your actual platform_admin role_id if different
  if (profile?.role_id !== 4) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <div
            className="
            bg-card 
            border border-border 
            rounded-xl 
            shadow-sm 
            overflow-hidden
          "
          >
            <div className="p-6 md:p-8 lg:p-10">{children}</div>
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-border bg-card/50 py-4 text-center text-sm text-muted-foreground">
        <p>Campy Admin • {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
