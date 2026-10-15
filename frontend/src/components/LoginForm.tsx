"use client";

import { type FormEvent, useState } from "react";
import { ApiError } from "@/lib/api";

export type Registration = { username: string; displayName: string; password: string };

type LoginFormProps = {
  onSubmit: (username: string, password: string) => Promise<void>;
  onRegister: (registration: Registration) => Promise<void>;
  notice?: string | null;
};

const inputClass = "mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-3 outline-none transition focus:border-[var(--primary-blue)]";
const labelClass = "block text-sm font-medium text-[var(--navy-dark)]";

export const LoginForm = ({ onSubmit, onRegister, notice }: LoginFormProps) => {
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const registering = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) return;
    if (registering && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      if (registering) await onRegister({ username, displayName, password });
      else await onSubmit(username, password);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : registering ? "Unable to create the account. Please retry." : "Unable to sign in. Please retry.");
    } finally {
      setIsBusy(false);
    }
  };

  const switchMode = () => {
    setMode(registering ? "sign-in" : "register");
    setError(""); setPassword(""); setConfirm("");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6 py-12">
      <div className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Kanban Studio
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          {registering ? "Create account" : "Sign in"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          {registering
            ? "Usernames use 3-32 lowercase letters, numbers, dots, dashes or underscores. Passwords need at least 8 characters."
            : "Demo account: user / password."}
        </p>
        {notice ? (
          <p role="alert" className="mt-4 rounded-2xl border border-[var(--accent-yellow)] px-4 py-3 text-sm font-medium text-[var(--navy-dark)]">
            {notice}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className={labelClass}>
            Username
            <input value={username} onChange={(event) => setUsername(registering ? event.target.value.toLowerCase() : event.target.value)}
              className={inputClass} aria-label="Username" autoComplete="username" required maxLength={registering ? 32 : 100} />
          </label>
          {registering && (
            <label className={labelClass}>
              Display name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)}
                className={inputClass} aria-label="Display name" autoComplete="name" required maxLength={60} />
            </label>
          )}
          <label className={labelClass}>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)}
              className={inputClass} aria-label="Password" autoComplete={registering ? "new-password" : "current-password"}
              required minLength={registering ? 8 : undefined} maxLength={100} />
          </label>
          {registering && (
            <label className={labelClass}>
              Confirm password
              <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)}
                className={inputClass} aria-label="Confirm password" autoComplete="new-password" required maxLength={100} />
            </label>
          )}

          {error ? (
            <p aria-live="polite" className="text-sm font-medium text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isBusy}
            className="w-full rounded-2xl bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90"
          >
            {isBusy ? (registering ? "Creating account..." : "Signing in...") : (registering ? "Create account" : "Sign in")}
          </button>
        </form>
        <button type="button" onClick={switchMode} className="mt-6 w-full text-center text-sm font-semibold text-[var(--primary-blue)]">
          {registering ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </main>
  );
};
