"use client";

import { type FormEvent, useState } from "react";

type LoginFormProps = {
  onSubmit: (username: string, password: string) => boolean;
};

const VALID_USERNAME = "user";
const VALID_PASSWORD = "password";

export const LoginForm = ({ onSubmit }: LoginFormProps) => {
  const [username, setUsername] = useState(VALID_USERNAME);
  const [password, setPassword] = useState(VALID_PASSWORD);
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isValid = onSubmit(username, password);
    if (!isValid) {
      setError("Incorrect username or password.");
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
            className="w-full rounded-2xl bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
};

export { VALID_PASSWORD, VALID_USERNAME };
