import { getUserRoleName } from "@/app/data/users/get-user-role";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

import { BackHeader } from "@/components/layout/back-header";
import { routes } from "@/lib/routes";
import { USER_ROLE_PLATEFORMADMIN } from "@/lib/constants";
import { DashboardCards } from "./DashboardCards";

export default async function AdminDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(routes.auth());
  }

  const user_role = await getUserRoleName(user.id);

  if (!user_role || user_role !== USER_ROLE_PLATEFORMADMIN) {
    redirect(routes.home());
  }

  return (
    <div className="container mx-auto py-6 md:py-10 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title="Admin Dashboard"
        description="Quick access to campground management tools"
      />

      <DashboardCards />
    </div>
  );
}
