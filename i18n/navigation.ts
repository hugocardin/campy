import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";

// This creates the localized wrappers (Link, useRouter, etc.)
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
