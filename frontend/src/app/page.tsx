"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { api } from "@/lib/api";

export default function Home() {
  const [status, setStatus] = useState<"checking" | "signed-in" | "signed-out" | "signing-out">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function restoreSession() {
      try {
        await api("/api/session", undefined, controller.signal);
        if (!controller.signal.aborted) setStatus("signed-in");
      } catch {
        if (!controller.signal.aborted) setStatus("signed-out");
      }
    }
    void restoreSession();
    return () => controller.abort();
  }, []);

  const handleLogin = async (username: string, password: string) => {
    await api("/api/login", { username, password });
    setError(null);
    setStatus("signed-in");
  };

  const handleLogout = async () => {
    // Unmount the board immediately, aborting pending browser requests.
    setStatus("signing-out");
    try {
      await api("/api/logout", {});
      setError(null);
    } catch {
      setError("Sign out failed. Your server session may still be active. Retry sign out.");
    } finally {
      setStatus("signed-out");
    }
  };

  if (status === "checking" || status === "signing-out") {
    return <p role="status" className="p-8">{status === "checking" ? "Checking session..." : "Signing out..."}</p>;
  }
  if (status === "signed-out") {
    return <>{error && <div role="alert" className="p-4">{error} <button onClick={() => void handleLogout()}>Retry sign out</button></div>}<LoginForm onSubmit={handleLogin} /></>;
  }
  return <KanbanBoard onLogout={() => void handleLogout()} onSessionExpired={() => setStatus("signed-out")} />;
}
