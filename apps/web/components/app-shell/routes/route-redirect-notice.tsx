"use client";

import { useLayoutEffect } from "react";

interface RouteRedirectNoticeProps {
  label: string;
  to: string | null;
}

export function RouteRedirectNotice({ label, to }: RouteRedirectNoticeProps) {
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
