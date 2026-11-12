import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CampgroundCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-4/3 md:aspect-video w-full" />
      <CardContent className="p-4">
        <Skeleton className="h-6 w-4/5 mb-2" />
        <Skeleton className="h-4 w-3/5" />
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Skeleton className="h-9 w-32" />
      </CardFooter>
    </Card>
  );
}
