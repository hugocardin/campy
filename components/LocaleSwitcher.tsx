"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing"; // import your routing config
import { Globe } from "lucide-react"; // or any globe/language icon you like
import { useLocale } from "next-intl";

// Optional: map codes to nice display names (translated or static)
const localeNames: Record<string, string> = {
  "en-CA": "English",
  "fr-CA": "Français",
  // Add more later: "en-US": "English (US)", "es": "Español"
};

export default function LocaleSwitcher() {
  const currentLocale = useLocale();
  const pathname = usePathname();

  // Other locales (exclude current)
  const otherLocales = routing.locales.filter((l) => l !== currentLocale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Globe className="h-5 w-5" />
          <span className="sr-only">Change language</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-40">
        {/* Current locale shown as disabled/selected */}
        <DropdownMenuItem disabled className="font-medium">
          {localeNames[currentLocale] || currentLocale.toUpperCase()}
        </DropdownMenuItem>

        {otherLocales.map((locale) => (
          <DropdownMenuItem key={locale} asChild>
            <Link href={pathname} locale={locale} className="cursor-pointer">
              {localeNames[locale] || locale.toUpperCase()}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
