"use client";

import { createContext, useContext, useLayoutEffect } from "react";
import type { DependencyList, RefObject } from "react";
import type { WorkspaceTab } from "./model/route-chrome";

interface WorkspaceViewportValue {
  active: boolean;
  tab: WorkspaceTab;
  viewportRef: RefObject<HTMLDivElement | null>;
}

const WorkspaceViewportContext = createContext<WorkspaceViewportValue | null>(null);

interface WorkspaceViewportProviderProps extends WorkspaceViewportValue {
  children: React.ReactNode;
}

export function WorkspaceViewportProvider({ active, children, tab, viewportRef }: WorkspaceViewportProviderProps) {
  return (
    <WorkspaceViewportContext.Provider value={{ active, tab, viewportRef }}>
      {children}
    </WorkspaceViewportContext.Provider>
  );
}

export function useWorkspaceViewport() {
  const value = useContext(WorkspaceViewportContext);
  if (!value) {
    throw new Error("useWorkspaceViewport must be used within a WorkspaceViewportProvider");
  }
  return value;
}

export function useWorkspaceScrollReset(deps: DependencyList = []) {
  const { viewportRef } = useWorkspaceViewport();

  useLayoutEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [viewportRef, ...deps]);
}
