"use client";

import { useLayoutEffect } from "react";

interface RouteRedirectProps {
  to: string | null;
}

export function RouteRedirect({ to }: RouteRedirectProps) {
  useLayoutEffect(() => {
    if (!to || typeof window === "undefined") {
      return;
    }

    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (currentPath === to) {
      return;
    }

    window.location.replace(to);
  }, [to]);

  return null;
}
