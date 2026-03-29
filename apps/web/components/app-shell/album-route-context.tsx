"use client";

import { createContext, useContext } from "react";
import type { AlbumSummary, AlbumWorkspace, User } from "../../lib/types";
import type { AppSessionState } from "./hooks/use-app-session";
import type { SettingsState } from "./hooks/use-settings-state";
import type { TimelineState } from "./hooks/use-timeline-state";
import type { NavDirection, SettingsScreen, TabKey, TimelineDayGroup } from "./model/types";
import type { AppShellViewModel } from "./model/view";

export interface AlbumRouteContextValue {
  activeTab: TabKey;
  session: AppSessionState;
  activeAlbum: AlbumWorkspace;
  activeBaby: AppShellViewModel["activeBaby"];
  albumOptions: AlbumSummary[];
  currentUser: User | null;
  settings: SettingsState;
  timeline: TimelineState;
  appView: AppShellViewModel;
  timelineDays: TimelineDayGroup[];
  handleAlbumChange: (albumId: string) => void;
  handleOpenUploadFlow: () => void;
  handleOpenLightbox: (entryId: string, mediaId: string) => void;
  handleOpenEditEntry: (entryId: string) => void;
  handleOpenAlbumSettings: (albumId: string) => void | Promise<void>;
  navigateSettingsScreen: (screen: SettingsScreen, direction?: NavDirection, options?: { memberId?: string }) => void;
  handleLogout: () => void;
}

const AlbumRouteContext = createContext<AlbumRouteContextValue | null>(null);

interface AlbumRouteProviderProps {
  children: React.ReactNode;
  value: AlbumRouteContextValue;
}

export function AlbumRouteProvider({ children, value }: AlbumRouteProviderProps) {
  return <AlbumRouteContext.Provider value={value}>{children}</AlbumRouteContext.Provider>;
}

export function useAlbumRouteContext() {
  const value = useContext(AlbumRouteContext);
  if (!value) {
    throw new Error("useAlbumRouteContext must be used within AlbumRouteProvider");
  }
  return value;
}
