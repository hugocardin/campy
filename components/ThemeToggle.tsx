"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();

  // resolvedTheme is safe after hydration
  const resolved = theme === "system" ? systemTheme : theme;
  const isDark = resolved === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`Switch mode`}
      className="relative"
    >
      <Sun
        className={cn(
          "h-5 w-5 text-yellow-500 absolute transition-all duration-1000",
          isDark
            ? "opacity-0 scale-75 rotate-90"
            : "opacity-100 scale-100 rotate-0",
        )}
      />
      <Moon
        className={cn(
          "h-5 w-5 text-slate-700 dark:text-slate-300 absolute transition-all duration-1000",
          !isDark
            ? "opacity-0 scale-75 -rotate-90"
            : "opacity-100 scale-100 rotate-0",
        )}
      />
    </Button>
  );
}
