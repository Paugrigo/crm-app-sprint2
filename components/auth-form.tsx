"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { signIn, signUp } from "@/lib/auth-actions";
import { buttonPrimary, errorBox, input, label, panel, textLink } from "./ui";

type Mode = "sign-in" | "sign-up";

/** Where to go after signing in: the `next` page the proxy sent us from, if it's on this site. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  // Only same-site paths: "/x" but not "//evil.example" or "/\\evil.example".
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    return next;
  }
  return "/";
}

const NOTICES: Record<string, string> = {
  "confirm-failed":
    "That confirmation link didn't work. It may have expired or been used already; try signing in, or sign up again.",
};

const labelClass = `mb-1.5 block ${label}`;

export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  // A message passed in the URL, e.g. after following an email confirmation link.
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("notice");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable after mount
    if (key && NOTICES[key]) setNotice(NOTICES[key]);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = mode === "sign-in" ? await signIn(email, password) : await signUp(email, password);
      if (!result.ok) {
        setError(result.error);
      } else if (result.needsConfirmation) {
        setConfirmationSentTo(email.trim());
      } else {
        // A full page load, so nothing from a previous session stays in memory.
        window.location.assign(nextPath());
        return; // Keep the button disabled while the next page loads.
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  if (confirmationSentTo) {
    return (
      <div className={`${panel} p-6`}>
        <p className={label}>Check your email</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-fg">Confirm your address</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a confirmation link to <span className="text-fg">{confirmationSentTo}</span>.
          Open it in this browser to finish creating your account.
        </p>
        <Link href="/sign-in" className={`${buttonPrimary} mt-5`}>
          Go to sign in
        </Link>
      </div>
    );
  }

  const isSignIn = mode === "sign-in";

  return (
    <div className={`${panel} p-6`}>
      <p className="font-mono text-[11px] uppercase tracking-wider text-accent-fg">
        {isSignIn ? "Welcome back" : "New account"}
      </p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">
        {isSignIn ? "Sign in" : "Create an account"}
      </h1>

      {notice && (
        <p role="status" className="mt-4 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-fg">
          {notice}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={isSignIn ? undefined : 6}
            autoComplete={isSignIn ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={isSignIn ? undefined : "password-hint"}
            className={input}
          />
          {!isSignIn && (
            <p id="password-hint" className="mt-1.5 font-mono text-xs text-faint">
              At least 6 characters.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className={errorBox}>
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className={`${buttonPrimary} w-full py-2`}>
          {pending ? (isSignIn ? "Signing in…" : "Creating account…") : isSignIn ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
        {isSignIn ? (
          <>
            No account yet?{" "}
            <Link href="/sign-up" className={textLink}>
              Create one
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className={textLink}>
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
