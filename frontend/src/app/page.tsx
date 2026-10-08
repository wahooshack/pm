"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm, VALID_PASSWORD, VALID_USERNAME } from "@/components/LoginForm";

const AUTH_STORAGE_KEY = "kanban-demo-auth";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    const storedState = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    setIsAuthenticated(storedState === "authenticated");
    setHasMounted(true);
  }, []);

  const handleLogin = (username: string, password: string) => {
    const isValid = username === VALID_USERNAME && password === VALID_PASSWORD;
    if (isValid) {
      window.sessionStorage.setItem(AUTH_STORAGE_KEY, "authenticated");
      setIsAuthenticated(true);
    }
    return isValid;
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    setIsAuthenticated(false);
  };

  if (!hasMounted) {
    return null;
  }

  if (!isAuthenticated) {
    return <LoginForm onSubmit={handleLogin} />;
  }

  return <KanbanBoard onLogout={handleLogout} />;
}
