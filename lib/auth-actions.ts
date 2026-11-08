"use server";

// Sign in, sign up, and sign out run on the server, so the Supabase session cookies are set
// (or cleared) in the response. The caller then does a full page load (window.location), which
// drops all in-memory data from the previous session and lets proxy.ts route the new request.

import type { AuthError } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { THEME_COOKIE } from "./theme-cookie";
import { createClient } from "./supabase/server";

export type AuthResult =
  | { ok: true; needsConfirmation?: false }
  | { ok: true; needsConfirmation: true }
  | { ok: false; error: string };

const MIN_PASSWORD_LENGTH = 6;

function readCredentials(email: unknown, password: unknown) {
  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  const pass = typeof password === "string" ? password : "";
  return { email: trimmedEmail, password: pass };
}

function describeAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Wrong email or password.";
    case "email_not_confirmed":
      return "Confirm your email address first: open the link in the email we sent you.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Sign in instead.";
    case "weak_password":
      return `Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`;
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Wait a few minutes and try again.";
    case "signup_disabled":
      return "Sign-ups are turned off for this app.";
    default:
      return error.message || "Something went wrong. Try again.";
  }
}

export async function signIn(email: unknown, password: unknown): Promise<AuthResult> {
  const credentials = readCredentials(email, password);
  if (!credentials.email || !credentials.password) {
    return { ok: false, error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials);
  if (error) return { ok: false, error: describeAuthError(error) };
  return { ok: true };
}

export async function signUp(email: unknown, password: unknown): Promise<AuthResult> {
  const credentials = readCredentials(email, password);
  if (!credentials.email) return { ok: false, error: "Enter your email address." };
  if (credentials.password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  // The confirmation email links back to this app (e.g. http://localhost:3000/auth/confirm).
  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...credentials,
    options: origin ? { emailRedirectTo: `${origin}/auth/confirm` } : undefined,
  });
  if (error) return { ok: false, error: describeAuthError(error) };

  // With email confirmation on, Supabase doesn't reveal that an email is taken: it returns a
  // user with no identities instead of an error.
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, error: "An account with this email already exists. Sign in instead." };
  }
  // No session means the project requires email confirmation before the first sign-in.
  if (!data.session) return { ok: true, needsConfirmation: true };
  return { ok: true };
}

/**
 * Signs out this browser only (other devices stay signed in). Returns ok: false if the session
 * couldn't be ended; the caller then stays on the page and shows an error.
 */
export async function signOut(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) return { ok: false };
  // The sign-in page (and the next user) start from the System theme.
  (await cookies()).delete(THEME_COOKIE);
  return { ok: true };
}
