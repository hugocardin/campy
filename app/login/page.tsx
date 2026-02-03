// app/login/page.tsx
import { createClient } from "@/lib/supabase/server";
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 p-8 bg-card rounded-xl border shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to Campy
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in or create an account
          </p>
        </div>

        <AuthForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
