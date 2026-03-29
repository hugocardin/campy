import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { generatePageMetadata } from "@/lib/utils";
import { redirect } from "next/navigation";
import AuthForm from "./AuthForm";

const PAGE_NAMESPACE = "auth.AuthPage" as const;

export const generateMetadata = () => generatePageMetadata(PAGE_NAMESPACE);

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const search = await searchParams;
  const redirectTo =
    typeof search.redirect === "string" ? search.redirect : routes.profile();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(redirectTo);
  }

  return <AuthForm redirectTo={redirectTo} />;
}
