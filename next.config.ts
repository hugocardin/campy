// next.config.ts
import { type NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl =
  createNextIntlPlugin();
  // Optional: path to your request config if not in default location
  // './i18n/request.ts'

/** Mirror of next/image RemotePattern (avoid importing Next internal paths). */
type ImageRemotePattern = {
  protocol?: "http" | "https";
  hostname: string;
  port?: string;
  pathname?: string;
};

function supabaseParkMediaRemotePattern(): ImageRemotePattern | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      pathname: "/storage/v1/object/public/park-media/**",
    };
  } catch {
    return null;
  }
}

const supabasePattern = supabaseParkMediaRemotePattern();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      ...(supabasePattern ? [supabasePattern] : []),
    ],
  },
};

export default withNextIntl(nextConfig);
