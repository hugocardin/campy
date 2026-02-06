import { LucideIcon } from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardCardProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

export function DashboardCard({
  href,
  icon: Icon,
  title,
  description,
}: DashboardCardProps) {
  return (
    <Link href={href}>
      <Card
        className={cn(
          "group h-full transition-all duration-200",
          "hover:shadow-md hover:border-primary/50 hover:scale-[1.02]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        )}
      >
        <CardHeader className="flex flex-row items-center gap-4 pb-4">
          <div className="rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl group-hover:text-primary transition-colors">
              {title}
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              {description}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
