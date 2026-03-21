"use client";

import { EditButton } from "@/components/buttons/EditButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UserProfile } from "@/entities/user-profile";
import { User } from "@supabase/supabase-js";
import { Calendar, Mail } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

type Props = {
  profile: UserProfile;
  user: User;
};

export default function ProfileClient({ profile, user }: Props) {
  const t = useTranslations("ProfilePage");

  const initials = profile.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : profile.email?.[0]?.toUpperCase();

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

                <EditButton href="" />
              </div>
            </div>

            {/* Right: Name + details */}
            <div className="flex-1 space-y-5 pt-1 sm:pt-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {profile.full_name}
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
                    {t("joined")}
                  </dt>
                  <dd className="text-base font-medium">{joinedDate}</dd>
                </div>
              </dl>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
