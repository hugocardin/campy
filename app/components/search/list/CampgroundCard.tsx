import { MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Campground } from "@/app/entities/campground";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { routes } from "@/lib/routes";

interface Props {
  campground: Campground;
}

export default function CampgroundCard({ campground }: Props) {
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
        {/* <div className="absolute top-3 left-3 flex gap-2">
          {campground.types.slice(0, 2).map((type) => (
            <Badge
              key={type}
              variant="secondary"
              className="bg-background/80 backdrop-blur-sm"
            >
              {type}
            </Badge>
          ))}
        </div> */}
      </div>

      <CardContent className="flex-1 p-4">
        <h3 className="font-semibold text-lg leading-tight line-clamp-2">
          {campground.name}
        </h3>

        <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span>
            {campground.city}, {campground.province}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <Star className="h-4 w-4 fill-primary text-primary" />
          <span className="font-medium">4.9</span>
          <span className="text-sm text-muted-foreground">(123)</span>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex items-center justify-between">
        {/* <div className="font-medium">
          {campground.priceRange}
          <span className="text-xs font-normal text-muted-foreground">
            {" "}
            / night
          </span>
        </div> */}
        <Button size="sm" asChild>
          <Link href={routes.campgroundDetail(campground.id)}>
            View Campground
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
