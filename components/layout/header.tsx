"use client";

import { signOutAction } from "@/app/actions/auth";
import { usePathname } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { USER_ROLE_PLATEFORMADMIN } from "@/lib/constants";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { routes } from "@/lib/routes";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import LocaleSwitcher from "../LocaleSwitcher";
import ThemeToggle from "../ThemeToggle";

export default function Header() {
  const tc = useTranslations("common");
  const t_auth = useTranslations("auth");
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningOut, startSignOut] = useTransition();
  const supabase = createClient();
  // Monotonic id so a late getSession / auth event cannot overwrite a newer one.
  const authSyncId = useRef(0);

  const applyUser = (next: User | null, syncId: number) => {
    if (syncId !== authSyncId.current) return;
    setUser(next);
    setLoading(false);
  };

  useEffect(() => {
    // Display-only source of truth: session + auth events (no network getUser).
    // INITIAL_SESSION fires on subscribe and covers the first paint.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_, session) => {
        applyUser(session?.user ?? null, ++authSyncId.current);
      },
    );

    return () => {
      authSyncId.current += 1;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    // After server-action auth soft-navigates, sync from local session cookies
    // without re-subscribing the auth listener or hitting Auth over the network.
    const syncId = ++authSyncId.current;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        applyUser(data.session?.user ?? null, syncId);
      })
      .catch(() => {
        // Storage/cookie parse failures: treat as signed out for this sync.
        applyUser(null, syncId);
      });
  }, [supabase, pathname]);

  const handleSignOut = () => {
    startSignOut(async () => {
      // Revoke while cookies still exist, then always clear local session.
      // redirect() from the action throws NEXT_REDIRECT on success — rethrow it
      // after finally so the router can navigate.
      try {
        await signOutAction();
      } catch (error) {
        if (!isRedirectError(error)) {
          toast.error(t_auth("errors.network_error"));
        } else {
          throw error;
        }
      } finally {
        await supabase.auth.signOut({ scope: "local" });
        authSyncId.current += 1;
        setUser(null);
        setLoading(false);
      }
    });
  };

  const { roleName, isLoading: roleLoading } = useUserRole(user?.id);

  if (loading) {
    return (
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="flex h-16 items-center justify-between">
          <Link href={routes.home()} className="flex items-center gap-3">
            <div className="relative h-10 w-40">
              <Image
                src="/logo.png"
                alt={tc("logoAlt")}
                fill
                className="object-contain"
                priority
              />
            </div>
          </Link>

          <div className="flex items-center gap-6">
            <ThemeToggle />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href={routes.home()} className="flex items-center gap-3">
          <div className="relative h-10 w-40 md:w-48">
            <Image
              src="/logo.png"
              alt={tc("logoAlt")}
              fill
              className="object-contain"
              priority
            />
          </div>
          <span className="text-xl font-bold text-primary hidden md:block">
            {tc("brand")}
          </span>
        </Link>

        {/* Right side: Theme + Auth */}
        <div className="flex items-center gap-4 md:gap-6">
          <ThemeToggle />

          <LocaleSwitcher />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 rounded-full"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {user.email?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem asChild>
                  <Link href={routes.profile()}>{tc("header.profile")}</Link>
                </DropdownMenuItem>

                {!roleLoading && roleName === USER_ROLE_PLATEFORMADMIN && (
                  <DropdownMenuItem asChild>
                    <Link href={routes.platformAdmin.root()}>
                      {tc("header.plateformAdminDashboard")}
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  disabled={isSigningOut}
                  onClick={handleSignOut}
                >
                  {t_auth("signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="default" size="sm" asChild>
              <Link href={routes.auth()}>
                {t_auth("signIn")} / {t_auth("signUp")}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
