"use client";

import { MapPin } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Campground } from "@/entities/campground";
import { Link } from "@/i18n/navigation";
import { formatDistanceKm } from "@/lib/campground-search";
import { formatCampgroundPricePerNight } from "@/lib/campground-price";
import { formatCampgroundLocation } from "@/lib/format-campground-location";
import { routes, type CampgroundDetailQuery } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";

interface Props {
  campground: Campground;
  /** Carry guest rig prefs into the detail URL (#34). */
  detailQuery?: CampgroundDetailQuery;
  /** Shared list ↔ map hover highlight (#24 §4). */
  highlighted?: boolean;
  /** Scroll into view when the map drives the highlight. */
  scrollIntoViewOnHighlight?: boolean;
  onHover?: (id: string | null) => void;
}

export default function CampgroundCard({
  campground,
  detailQuery,
  highlighted = false,
  scrollIntoViewOnHighlight = false,
  onHover,
}: Props) {
  const t = useTranslations("search.controls");
  const locale = useLocale();
  const distanceLabel = formatDistanceKm(campground.distanceMeters);
  const priceLabel = formatCampgroundPricePerNight(
    campground.minPricePerNight,
    locale,
  );
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlighted || !scrollIntoViewOnHighlight) return;
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlighted, scrollIntoViewOnHighlight]);

  return (
    <Card
      ref={cardRef}
      data-campground-id={campground.id}
      data-highlighted={highlighted ? "true" : undefined}
      className={cn(
        "overflow-hidden flex flex-col h-full transition-shadow",
        highlighted
          ? "shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background"
          : "hover:shadow-md",
      )}
      onMouseEnter={() => onHover?.(campground.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocusCapture={() => onHover?.(campground.id)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onHover?.(null);
        }
      }}
    >
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
        {distanceLabel ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("distanceKm", { km: distanceLabel })}
          </p>
        ) : null}
        {priceLabel ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("fromPrice", { price: priceLabel })}
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="p-4 pt-0 flex items-center justify-start">
        <Button size="sm" asChild>
          <Link href={routes.campgroundDetail(campground.id, detailQuery)}>
            {t("viewCampground")}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
