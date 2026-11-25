// next.config.ts
import { type NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl =
  createNextIntlPlugin();
  // Optional: path to your request config if not in default location
  // './i18n/request.ts'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "ccitrcywfpsowdzgovkt.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // Optional: if you're on Next.js 15+ and hit Turbopack issues with next-intl
  // experimental: {
  //   turbopack: {},
  // },
};

export default withNextIntl(nextConfig);
