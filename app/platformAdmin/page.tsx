import { getUserRoleName } from "@/app/data/users/get-user-role";
import { createClient } from "@/lib/supabase/server";
import { Leaf, Tags, Tent } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
    <div className="container mx-auto py-6 md:py-10 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-1">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground">
          Quick access to campground management tools
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {/* Amenities */}
        <Link href={routes.platformAdmin.amenities()}>
          <Card
            className={cn(
              "group h-full transition-all duration-200",
              "hover:shadow-md hover:border-primary/50 hover:scale-[1.02]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            )}
          >
            <CardHeader className="flex flex-row items-center gap-4 pb-4">
              <div className="rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
                <Leaf className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-xl group-hover:text-primary transition-colors">
                  Amenities
                </CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  Manage the list of available amenities
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>

        {/* Amenity Categories */}
        <Link href={routes.platformAdmin.amenityCategory()}>
          <Card
            className={cn(
              "group h-full transition-all duration-200",
              "hover:shadow-md hover:border-primary/50 hover:scale-[1.02]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            )}
          >
            <CardHeader className="flex flex-row items-center gap-4 pb-4">
              <div className="rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
                <Tags className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-xl group-hover:text-primary transition-colors">
                  Amenity Categories
                </CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  Organize amenities into groups (Services, Facilities, etc.)
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>

        {/* Campgrounds */}
        <Link href={routes.platformAdmin.campgrounds()}>
          <Card
            className={cn(
              "group h-full transition-all duration-200",
              "hover:shadow-md hover:border-primary/50 hover:scale-[1.02]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            )}
          >
            <CardHeader className="flex flex-row items-center gap-4 pb-4">
              <div className="rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
                <Tent className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-xl group-hover:text-primary transition-colors">
                  Campgrounds
                </CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  Organize campgrounds
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
