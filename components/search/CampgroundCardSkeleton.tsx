import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CampgroundCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-4/3 md:aspect-video w-full" />
      <CardContent className="p-4">
        <Skeleton className="h-6 w-4/5 mb-2" />
        <Skeleton className="h-4 w-3/5 mb-3" />
        <Skeleton className="h-5 w-24" />
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-9 w-20" />
      </CardFooter>
    </Card>
  );
}
