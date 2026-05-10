import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
// import { Loader2 } from "lucide-react";
import { Loader2, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    mode: (s.mode as string) === "signup" ? "signup" : "login",
  }),
  component: AuthPage,
});

const RESERVED = new Set(["admin", "root", "support", "system", "pulse", "me", "you", "null", "undefined"]);

const usernameSchema = z.string()
  .trim()
  .min(3, "At least 3 characters")
  .max(20, "Max 20 characters")
  .regex(/^[a-z0-9_]+$/, "Only a-z, 0-9, _")
  .refine((u) => !RESERVED.has(u), "Username is reserved");

const emailSchema = z.string().trim().email("Invalid email").max(255);
const passwordSchema = z.string().min(8, "At least 8 characters").max(72);

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const isSignup = mode === "signup";

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // GPT
  const [resetLoading, setResetLoading] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
// const [ShowResetPasswords, setShowResetPasswords] = useState(false);
// const [ShowResetPasswords, setShowConfirmPassword] = useState(false);
const [showResetPasswords, setShowResetPasswords] = useState(false);


  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/" });
  }, [user, authLoading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isSignup) {
        const u = usernameSchema.parse(username.toLowerCase());
        emailSchema.parse(email);
        passwordSchema.parse(password);

        // pre-check uniqueness (race-safe via DB UNIQUE)
        const { data: existing } = await supabase.from("profiles").select("id").eq("username", u).maybeSingle();
        if (existing) throw new Error("Username already taken");

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: u, display_name: u },
            emailRedirectTo: `${window.location.origin}/chat`,
          },
        });
        if (error) throw error;
        toast.success("Account created! Welcome to Pulse.");
      } else {
        emailSchema.parse(email);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
      }
    } catch (err) {
      const msg = err instanceof z.ZodError ? err.issues[0].message : err instanceof Error ? err.message : "Failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };
//  GPT - Reset password
  // const handleForgotPassword = async () => {
  //   if (!email) {
  //     toast.error("Please enter your email first");
  //     return;
  //   }
  
  //   try {
  //     setResetLoading(true);
  
  //     const { error } = await supabase.auth.resetPasswordForEmail(email, {
  //       redirectTo: `${window.location.origin}/reset-password`,
  //     });
  
  //     if (error) throw error;
  
  //     toast.success("Password reset email sent!");
  //   } catch (err: any) {
  //     toast.error(err.message || "Failed to send reset email");
  //   } finally {
  //     setResetLoading(false);
  //   }
  // };
  const handleForgotPassword = () => {
    if (!email) {
      toast.error("Please enter your email first");
      return;
    }
  
    setResetEmail(email);
    setShowResetModal(true);
  };
  const handlePasswordReset = async () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
  
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
  
    try {
      setResetLoading(true);
  
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
  
      if (error) throw error;
  
      toast.success("Password updated successfully!");
  
      setShowResetModal(false);
  
      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: resetEmail,
          password: newPassword,
        });
  
      if (loginError) throw loginError;
  
      navigate({ to: "/" });
  
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center justify-center mb-8">
          <Logo variant="full" size="lg" asLink />
        </div>

        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-8 shadow-elegant">
          <h1 className="font-display text-2xl font-bold">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSignup ? "Pick a unique username and start chatting." : "Sign in to continue chatting."}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {isSignup && (
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="yourname"
                    className="pl-7"
                    autoComplete="username"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">3–20 chars, lowercase letters, numbers, underscore.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            {/*
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={isSignup ? "new-password" : "current-password"} />
            </div>

            <Button type="submit" disabled={submitting} className="w-full bg-gradient-primary hover:opacity-90 shadow-glow h-11">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : isSignup ? "Create account" : "Sign in"}
            </Button> */}
            <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="pr-10"
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          </div>

          {!isSignup && (
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm text-primary hover:text-primary/80 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
          )}

<Button
  type="submit"
  disabled={submitting}
  className="w-full bg-gradient-primary hover:opacity-90 shadow-glow h-11 text-white font-semibold"
>
  {submitting ? (
    <Loader2 className="size-4 animate-spin" />
  ) : isSignup ? (
    "Create account"
  ) : (
    "Sign in"
  )}
</Button>
                      
          </form>

          <p className="text-sm text-muted-foreground text-center mt-6">
            {isSignup ? "Already have an account? " : "New here? "}
            <Link
              to="/auth"
              search={{ mode: isSignup ? "login" : "signup" }}
              className="text-primary hover:underline font-medium"
            >
              {isSignup ? "Sign in" : "Create one"}
            </Link>
          </p>
        </div>
        {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/95 p-6 shadow-2xl animate-in fade-in zoom-in-95">
      
        <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-foreground">
          Reset Password
        </h2>

        <button
          onClick={() => setShowResetModal(false)}
          className="text-muted-foreground hover:text-foreground text-xl"
        >
          ×
        </button>
      </div>

      <div className="space-y-4">

        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">
            Registered Email
          </label>

          <Input
            value={resetEmail}
            disabled
            className="bg-muted/40"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">
            New Password
          </label>

          {/* <Input
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          /> */}
          <div className="relative">
          <Input
            type={showResetPasswords ? "text" : "password"}
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="pr-10"
          />

          <button
            type="button"
            onClick={() => setShowResetPasswords(!showResetPasswords)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showResetPasswords ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">
            Confirm Password
          </label>

          {/* <Input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          /> */}
          <div className="relative">
          <Input
            type={showResetPasswords ? "text" : "password"}
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="pr-10"
          />

          <button
            type="button"
            onClick={() =>
              setShowResetPasswords(!showResetPasswords)
            }
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showResetPasswords ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        </div>

        <Button
          onClick={handlePasswordReset}
          disabled={resetLoading}
          className="w-full bg-gradient-primary hover:opacity-90 h-11 mt-2"
        >
          {resetLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Update Password"
          )}
        </Button>
        </div>
        </div>
        </div>
      )}
      </motion.div>
    </div>
  );
}
