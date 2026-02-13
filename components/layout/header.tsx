"use client";

import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
import { useTranslations } from "next-intl";
import LocaleSwitcher from "../LocaleSwitcher";
import ThemeToggle from "../ThemeToggle";

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();
  const t = useTranslations();

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoading(false);
    };

    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_, session) => {
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
    router.push(routes.home());
    router.refresh();
  };

  const { roleName, isLoading: roleLoading } = useUserRole();

  // Loading skeleton
  if (loading) {
    return (
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href={routes.home()} className="flex items-center gap-3">
            <div className="relative h-10 w-40">
              <Image
                src="/logo.png"
                alt="Campy Logo"
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
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href={routes.home()} className="flex items-center gap-3">
          <div className="relative h-10 w-40 md:w-48">
            <Image
              src="/logo.png"
              alt="Campy Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <span className="text-xl font-bold text-primary hidden md:block">
            Campy {t("test")}
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
                    {/* Add avatar_url later: <AvatarImage src={user.user_metadata?.avatar_url} /> */}
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {user.email?.[0]?.toUpperCase() || "?"}
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
                  <Link href={routes.profile()}>Profile</Link>
                </DropdownMenuItem>

                {!roleLoading && roleName === USER_ROLE_PLATEFORMADMIN && (
                  <DropdownMenuItem asChild>
                    <Link href={routes.platformAdmin.root()}>
                      Admin Dashboard
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onClick={handleSignOut}
                >
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="default" size="sm" asChild>
              <Link href={routes.auth()}>Sign In / Sign Up</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
