import { Leaf, Tags } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserRoleName } from "@/data/users/get-user-role";
import { routes } from "@/lib/routes";

export default async function AdminDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(routes.auth());
  }

  const user_role = await getUserRoleName(user.id);

  if (!user_role || user_role !== "platform_admin") {
    redirect(routes.home());
  }

  return (
    <div className="space-y-8 p-6 md:p-8">
      <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
        Admin Dashboard
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Amenities Card */}
        <Link
          href="/admin/amenities"
          className="
            group block
            p-6
            bg-card
            border border-border
            rounded-xl
            shadow-sm
            hover:shadow-md
            hover:border-primary/60
            hover:bg-primary/5
            transition-all duration-200
            focus-visible:outline-none focus-visible:ring-2 
            focus-visible:ring-primary focus-visible:ring-offset-2 
            focus-visible:ring-offset-background
          "
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Leaf className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className="
                text-xl font-semibold 
                text-foreground 
                group-hover:text-primary 
                transition-colors
              "
              >
                Amenities
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage the list of available amenities
              </p>
            </div>
          </div>
        </Link>

        {/* Amenity Categories Card */}
        <Link
          href="/admin/amenity-categories"
          className="
            group block
            p-6
            bg-card
            border border-border
            rounded-xl
            shadow-sm
            hover:shadow-md
            hover:border-primary/60
            hover:bg-primary/5
            transition-all duration-200
            focus-visible:outline-none focus-visible:ring-2 
            focus-visible:ring-primary focus-visible:ring-offset-2 
            focus-visible:ring-offset-background
          "
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Tags className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className="
                text-xl font-semibold 
                text-foreground 
                group-hover:text-primary 
                transition-colors
              "
              >
                Amenity Categories
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Organize amenities into groups (Services, Facilities, etc.)
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
