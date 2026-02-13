import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import Image from "next/image";
import { redirect } from "next/navigation";
import AuthForm from "./AuthForm";
import { routes } from "@/lib/routes";

export const metadata = {
  title: "Sign In / Sign Up - Campy",
  description: "Access or create your Campy account",
};

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const redirectTo =
    typeof params.redirect === "string" ? params.redirect : routes.profile();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(redirectTo);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <Image
              src="/logo.png"
              alt="Campy Logo"
              width={140}
              height={48}
              priority
              className="h-12 w-auto"
            />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">
            Welcome to Campy
          </CardTitle>
          <CardDescription>...</CardDescription>
        </CardHeader>

        <CardContent>
          <AuthForm redirectTo={redirectTo} />
        </CardContent>
      </Card>
    </div>
  );
}
