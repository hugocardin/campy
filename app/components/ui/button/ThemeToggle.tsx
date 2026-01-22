"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-10 h-10 rounded-full bg-muted/20 animate-pulse" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="
        relative p-2 rounded-full
        hover:bg-muted/30 active:scale-95
        transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
        focus-visible:ring-offset-2 focus-visible:ring-offset-background
      "
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <Sun
        className={`
          h-5 w-5 transition-all duration-300 absolute inset-0 m-auto text-yellow-500
          ${isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-0"}
        `}
      />
      <Moon
        className={`
          h-5 w-5 transition-all duration-300 absolute inset-0 m-auto text-slate-700
          ${!isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0"}
        `}
      />
    </button>
  );
}
