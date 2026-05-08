"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`Switch mode`}
      className="relative overflow-hidden"
    >
      {/* Sun Icon - shown in light mode */}
      <Sun
        className={cn(
          "h-5 w-5 text-yellow-500 absolute transition-all duration-1000",
          "dark:opacity-0 dark:scale-75 dark:rotate-90",
        )}
      />

      {/* Moon Icon - shown in dark mode */}
      <Moon
        className={cn(
          "h-5 w-5 text-slate-700 absolute transition-all duration-1000",
          "dark:text-slate-300",
          "opacity-0 scale-75 -rotate-90 dark:opacity-100 dark:scale-100 dark:rotate-0",
        )}
      />
    </Button>
  );
}
