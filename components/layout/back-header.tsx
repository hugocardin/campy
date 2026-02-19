"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";

type BackHeaderProps = {
  title: string;
  description?: string;
  backTo?: string;
  className?: string;
  leftContent?: ReactNode;
  rightContent?: ReactNode;
};

export function BackHeader({
  title,
  description,
  backTo,
  className,
  leftContent,
  rightContent,
}: BackHeaderProps) {
  const router = useRouter();

  return (
    <div className={cn("mb-8 space-y-4 md:space-y-6", className)}>
      {/* Main header row */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left part: back + title + left content */}
        <div className="flex items-start md:items-center gap-4">
          {backTo && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(backTo)}
              className="h-10 w-10 rounded-full shrink-0 mt-1 md:mt-0"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}

          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {title}
            </h1>
            {description && (
              <p className="text-muted-foreground">{description}</p>
            )}
          </div>

          {/* Left slot – usually status badge, owner, etc. */}
          {leftContent && <div className="ml-4 md:ml-6">{leftContent}</div>}
        </div>

        {/* Right slot – actions */}
        {rightContent && (
          <div className="flex flex-wrap items-center gap-3">
            {rightContent}
          </div>
        )}
      </div>
    </div>
  );
}
