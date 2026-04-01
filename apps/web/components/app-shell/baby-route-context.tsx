"use client";

import { createContext, useContext } from "react";
import type { AlbumWorkspace, User } from "../../lib/types";
import type { AppSessionState } from "./hooks/use-app-session";
import type { SettingsState } from "./hooks/use-settings-state";
import type { AppShellViewModel } from "./model/view";
import type { JoinedBabySummary } from "./model/babies";

export interface BabyRouteContextValue {
  babyId: string;
  workspace: AlbumWorkspace;
  currentUser: User | null;
  joinedBabies: JoinedBabySummary[];
  session: AppSessionState;
  settings: SettingsState;
  appView: AppShellViewModel;
}

const BabyRouteContext = createContext<BabyRouteContextValue | null>(null);

interface BabyRouteProviderProps {
  children: React.ReactNode;
  value: BabyRouteContextValue;
}

export function BabyRouteProvider({ children, value }: BabyRouteProviderProps) {
  return <BabyRouteContext.Provider value={value}>{children}</BabyRouteContext.Provider>;
}

export function useBabyRouteContext() {
  const value = useContext(BabyRouteContext);
  if (!value) {
    throw new Error("useBabyRouteContext must be used within BabyRouteProvider");
  }
  return value;
}
