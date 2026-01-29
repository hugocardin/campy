"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import ThemeToggle from "../ui/button/ThemeToggle";

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    // 1. Get initial user (fast from storage/cookies)
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoading(false);
    };

    fetchUser();

    // 2. Listen for auth changes (sign in/out, refresh, etc.)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      },
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    // router.refresh(); // Refresh current page (or router.push('/') if you prefer redirect)
    // Optional: window.location.href = '/' for full reload if needed
  };

  // Optional: show skeleton/loader during initial check to avoid flicker
  if (loading) {
    return (
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Campy Logo"
              width={160}
              height={40}
              className="h-10 w-auto"
              priority
            />
            <span className="text-xl font-bold text-primary hidden sm:block">
              Campy
            </span>
          </Link>

          <div className="flex items-center gap-6">
            <ThemeToggle />
            <div className="w-24 h-9 bg-muted/30 rounded-full animate-pulse" />{" "}
            {/* Sign in/up placeholder */}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-card border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Campy Logo"
            width={160}
            height={40}
            className="h-10 w-auto"
            priority
          />
          <span className="text-xl font-bold text-primary hidden sm:block">
            Campy
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <ThemeToggle />

          {user ? (
            // Signed in: show user info + logout (replace with dropdown later if wanted)
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {user.email?.split("@")[0]} {/* or user.user_metadata?.name */}
              </span>
              <button
                onClick={handleSignOut}
                className="px-5 py-2 bg-destructive/10 text-destructive font-medium rounded-full text-sm hover:bg-destructive/20 transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            // Signed out: Sign In + Sign Up buttons (mimic your Clerk style)
            <>
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Sign In
              </Link>

              <Link
                href="/login" // TODO have a signup page
                className="px-5 py-2 bg-primary text-primary-foreground font-medium rounded-full text-sm hover:bg-primary-hover transition-colors shadow-sm"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
