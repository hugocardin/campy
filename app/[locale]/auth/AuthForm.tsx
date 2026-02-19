"use client";

import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mapAuthError } from "@/lib/errors/supabase-auth-errors";
import { routes } from "@/lib/routes";
import Image from "next/image";

type AuthFormProps = {
  redirectTo: string;
};

export default function AuthForm({ redirectTo }: AuthFormProps) {
  const t = useTranslations("AuthPage");
  const tc = useTranslations("common");

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(async () => {
      let result;

      if (mode === "signin") {
        result = await supabase.auth.signInWithPassword({ email, password });
      } else {
        result = await supabase.auth.signUp({ email, password });
      }

      if (result.error) {
        const { code, message } = mapAuthError(result.error);
        console.error("Auth error:", message);
        setError(code);
        return;
      }

      setEmail("");
      setPassword("");

      if (mode === "signup") {
        setMessage(t("signupSuccess"));
      } else {
        router.replace(redirectTo || routes.profile());
      }
    });
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
    setError(null);
    setMessage(null);
  };

  const title = mode === "signin" ? t("signInTitle") : t("signUpTitle");
  const submitText = mode === "signin" ? tc("signIn") : tc("signUp");
  const switchText = mode === "signin" ? t("noAccount") : t("haveAccount");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <Image
              src="/logo.png"
              alt={tc("logoAlt")}
              width={140}
              height={48}
              priority
              className="h-12 w-auto"
            />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">
            {t("welcome")}
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="text-center text-lg font-medium">{title}</div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">{t("emailLabel")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                required
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">{t("passwordLabel")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("passwordPlaceholder")}
                  required
                  minLength={8}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{t(`errors.${error}`)}</p>
            )}
            {message && (
              <p className="text-sm text-green-600 dark:text-green-400">
                {message}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? tc("processing") : submitText}
            </Button>

            <div className="text-center text-sm">
              <button
                type="button"
                onClick={toggleMode}
                className="text-primary hover:underline font-medium"
              >
                {switchText}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
