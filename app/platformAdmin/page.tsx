import { getUserRoleName } from "@/data/users/get-user-role";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

import { BackHeader } from "@/components/layout/back-header";
import { USER_ROLE_PLATEFORMADMIN } from "@/lib/constants";
import { routes } from "@/lib/routes";
import { DashboardCards } from "./DashboardCards";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(routes.auth());
  }

  const result = await getUserRoleName(user.id);

  if (!result.success || result.data !== USER_ROLE_PLATEFORMADMIN) {
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
