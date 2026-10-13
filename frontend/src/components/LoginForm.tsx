"use client";

import { type FormEvent, useState } from "react";
import { ApiError } from "@/lib/api";

type LoginFormProps = {
  onSubmit: (username: string, password: string) => Promise<void>;
  notice?: string | null;
};

const VALID_USERNAME = "user";
const VALID_PASSWORD = "password";

export const LoginForm = ({ onSubmit, notice }: LoginFormProps) => {
  const [username, setUsername] = useState(VALID_USERNAME);
  const [password, setPassword] = useState(VALID_PASSWORD);
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) return;
    setIsBusy(true);
    setError("");
    try {
      await onSubmit(username, password);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to sign in. Please retry.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6 py-12">
      <div className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Project Management MVP
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Sign in
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          Use the demo account to access the board.
        </p>
        {notice ? (
          <p role="alert" className="mt-4 rounded-2xl border border-[var(--accent-yellow)] px-4 py-3 text-sm font-medium text-[var(--navy-dark)]">
            {notice}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block text-sm font-medium text-[var(--navy-dark)]">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-3 outline-none transition focus:border-[var(--primary-blue)]"
              placeholder="Username"
              aria-label="Username"
              autoComplete="username"
            />
          </label>

          <label className="block text-sm font-medium text-[var(--navy-dark)]">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-3 outline-none transition focus:border-[var(--primary-blue)]"
              placeholder="Password"
              aria-label="Password"
              autoComplete="current-password"
            />
          </label>

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
            {isBusy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
};
