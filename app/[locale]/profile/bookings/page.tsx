import { BackHeader } from "@/components/layout/back-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { countMyBookings } from "@/data/bookings/count-my-bookings";
import { requireCurrentProfile } from "@/data/profile/require-current-profile";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { generatePageMetadata } from "@/lib/utils";
import { CalendarClock } from "lucide-react";
import { getTranslations } from "next-intl/server";

const PAGE_NAMESPACE = "profile.BookingsPage" as const;

export const generateMetadata = () => generatePageMetadata(PAGE_NAMESPACE);

type ShellKind = "empty" | "comingSoon" | "unavailable";

export default async function ProfileBookingsPage() {
  const t = await getTranslations(PAGE_NAMESPACE);
  const { user } = await requireCurrentProfile();
  const { count, unavailable } = await countMyBookings(user.id);

  const kind: ShellKind = unavailable
    ? "unavailable"
    : count > 0
      ? "comingSoon"
      : "empty";

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={t("pageHeader.title")}
        description={t("pageHeader.description")}
        backTo={routes.profile()}
      />

      <Card className="border-border/60 shadow-sm">
        <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <CalendarClock className="h-7 w-7" aria-hidden />
          </div>

          <div className="space-y-2 max-w-md">
            <h2 className="text-xl font-semibold tracking-tight">
              {t(`${kind}.title`)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(`${kind}.description`)}
            </p>
          </div>

          <Button asChild className="mt-2">
            <Link href={routes.home()}>{t("browseCta")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
