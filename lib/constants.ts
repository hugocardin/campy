export const SITE_NAME = "Campy";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const APP_NAME = "Campy";
export const APP_DESCRIPTION = "Online campround booking plateform";

export const DEFAULT_AVATAR = "/images/default-avatar.png";

// Navigation / UI
export const MAIN_NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Profile", href: "/profile" },
  { label: "Settings", href: "/settings" },
] as const;

export const PROFILE_NAV_ITEMS = [
  { label: "Personal Info", href: "/profile" },
  { label: "Security", href: "/profile/security" },
  { label: "Billing", href: "/profile/billing" },
  { label: "Notifications", href: "/profile/notifications" },
] as const;
