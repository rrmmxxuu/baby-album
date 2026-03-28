"use client";

import { createContext, useContext } from "react";
import { useSearchParams } from "next/navigation";
import { useAppSession, type AppSessionState } from "./hooks/use-app-session";

const AppSessionContext = createContext<AppSessionState | null>(null);

interface AppSessionProviderProps {
  children: React.ReactNode;
}

export function AppSessionProvider({ children }: AppSessionProviderProps) {
  const searchParams = useSearchParams();
  const session = useAppSession(searchParams.get("invite") ?? "");

  return <AppSessionContext.Provider value={session}>{children}</AppSessionContext.Provider>;
}

export function useAppSessionContext() {
  const value = useContext(AppSessionContext);
  if (!value) {
    throw new Error("useAppSessionContext must be used within AppSessionProvider");
  }
  return value;
}
