"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";

type AuthFormProps = {
  redirectTo: string;
};

export default function AuthForm({ redirectTo }: AuthFormProps) {
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
        setError(result.error.message);
        return;
      }

      if (mode === "signup") {
        // With email confirmation ON → show message
        // Optional: auto-switch back to signin after a delay
        setMessage(
          "Account created! Check your email to confirm and activate. (or naviguate in dev)",
        );
      } else {
        // Sign in success → redirect
        router.replace(redirectTo || "/profile");
      }
    });
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
    setError(null);
    setMessage(null);
  };

  const title = mode === "signin" ? "Sign In" : "Create Account";
  const submitText = mode === "signin" ? "Sign In" : "Sign Up";
  const switchText =
    mode === "signin"
      ? "Don't have an account? Sign up"
      : "Already have an account? Sign in";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center font-medium text-lg">{title}</div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ..."
        />
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <div className="relative mt-1">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ..."
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 ..."
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* Optional: Confirm password on signup 
      {mode === "signup" && (
        <div>
          <label
            htmlFor="confirm-password"
            className="block text-sm font-medium"
          >
            Confirm Password
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            className="mt-1 block w-full rounded-md border ..."
          />{" "}
          {/* Add client-side match validation later if needed 
        </div>
      )}*/}

      {error && <div className="text-sm text-destructive ...">{error}</div>}
      {message && <div className="text-sm text-green-600 ...">{message}</div>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 bg-primary ..."
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending ? "Processing..." : submitText}
      </button>

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
  );
}
