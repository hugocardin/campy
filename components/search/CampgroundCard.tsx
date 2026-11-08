"use client";

import { MapPin } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Campground } from "@/entities/campground";
import { Link } from "@/i18n/navigation";
import { formatCampgroundLocation } from "@/lib/format-campground-location";
import { routes } from "@/lib/routes";
import { useTranslations } from "next-intl";

interface Props {
  campground: Campground;
}

export default function CampgroundCard({ campground }: Props) {
  const t = useTranslations("search.controls");

  return (
    <Card className="overflow-hidden flex flex-col h-full hover:shadow-md transition-shadow">
      <div className="relative aspect-4/3 md:aspect-video">
        <Image
          src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop"
          alt={campground.name}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      </div>

      <CardContent className="flex-1 p-4">
        <h3 className="font-semibold text-lg leading-tight line-clamp-2">
          {campground.name}
        </h3>

        <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span>
            {formatCampgroundLocation(campground.city, campground.province)}
          </span>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex items-center justify-start">
        <Button size="sm" asChild>
          <Link href={routes.campgroundDetail(campground.id)}>
            {t("viewCampground")}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
