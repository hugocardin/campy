"use client";

import { EditButton } from "@/components/buttons/EditButton";
import FormattedRigLength from "@/components/rig-length/FormattedRigLength";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserProfile } from "@/entities/user-profile";
import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/person-initials";
import { routes } from "@/lib/routes";
import { User } from "@supabase/supabase-js";
import { Calendar, Mail, Ruler } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

type Props = {
  profile: UserProfile;
  user: User;
};

export default function ProfileClient({ profile, user }: Props) {
  const t_profile = useTranslations("profile");

  const initials = getInitials(profile.full_name, profile.email);

  const currentLocale = useLocale();
  const joinedDate = new Date(user.created_at).toLocaleDateString(
    currentLocale,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  return (
    <div className="space-y-8">
      {/* ─── Main Profile Card ─── */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
            {/* Left: Avatar + quick actions */}
            <div className="flex flex-col items-center sm:items-start gap-4">
              <Avatar className="h-24 w-24 sm:h-28 sm:w-28 border-2 border-background shadow-md">
                <AvatarImage
                  src={undefined}
                  alt={profile.full_name ?? profile.email}
                />

                <AvatarFallback className="text-4xl bg-primary/10 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="flex flex-col items-center sm:items-start gap-1">
                <Badge
                  variant="secondary"
                  className="text-xs font-medium px-2.5 py-0.5"
                >
                  {profile.role_name}
                </Badge>

                <EditButton href={routes.profileEdit()} />
              </div>
            </div>

            {/* Right: Name + details */}
            <div className="flex-1 space-y-5 pt-1 sm:pt-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {profile.full_name || t_profile("form.nameUnset")}
                </h1>
                <p className="text-muted-foreground mt-1 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {profile.email}
                </p>
              </div>

              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {t_profile("form.joined")}
                  </dt>
                  <dd className="text-base font-medium">{joinedDate}</dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <Ruler className="h-4 w-4" />
                    {t_profile("form.defaultRigLengthLabel")}
                  </dt>
                  <dd className="text-base font-medium">
                    <FormattedRigLength feet={profile.default_rig_length} />
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account links — keep nav out of the identity column as sections grow */}
      <section className="space-y-3" aria-labelledby="profile-account-links">
        <h2
          id="profile-account-links"
          className="text-sm font-medium text-muted-foreground"
        >
          {t_profile("accountLinks.title")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={routes.profileBookings()}>
              {t_profile("BookingsPage.navLink")}
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
