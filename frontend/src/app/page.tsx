"use client";

import { useEffect, useState } from "react";
import { LoginForm, type Registration } from "@/components/LoginForm";
import { Workspace } from "@/components/Workspace";
import { api, type User } from "@/lib/api";

export default function Home() {
  const [status, setStatus] = useState<"checking" | "signed-in" | "signed-out" | "signing-out">("checking");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function restoreSession() {
      try {
        const current = await api<User>("/api/session", undefined, controller.signal);
        if (!controller.signal.aborted) { setUser(current); setStatus("signed-in"); }
      } catch {
        if (!controller.signal.aborted) setStatus("signed-out");
      }
    }
    void restoreSession();
    return () => controller.abort();
  }, []);

  const signedIn = (current: User) => {
    setUser(current); setError(null); setNotice(null); setStatus("signed-in");
  };
  const handleLogin = async (username: string, password: string) => signedIn(await api<User>("/api/login", { username, password }));
  const handleRegister = async (registration: Registration) => signedIn(await api<User>("/api/register", registration));

  const handleLogout = async () => {
    // Unmount the board immediately, aborting pending browser requests.
    setStatus("signing-out");
    try {
      await api("/api/logout", {});
      setError(null);
    } catch {
      setError("Sign out failed. Your server session may still be active. Retry sign out.");
    } finally {
      setUser(null);
      setStatus("signed-out");
    }
  };

  if (status === "checking" || status === "signing-out") {
    return <p role="status" className="p-8">{status === "checking" ? "Checking session..." : "Signing out..."}</p>;
  }
  if (status === "signed-out" || !user) {
    return <>
      {error && <div role="alert" className="p-4">{error} <button onClick={() => void handleLogout()}>Retry sign out</button></div>}
      <LoginForm onSubmit={handleLogin} onRegister={handleRegister} notice={notice} />
    </>;
  }
  return <Workspace user={user} onUserChange={setUser} onLogout={() => void handleLogout()}
    onSessionExpired={(message) => { setNotice(message); setUser(null); setStatus("signed-out"); }} />;
}
