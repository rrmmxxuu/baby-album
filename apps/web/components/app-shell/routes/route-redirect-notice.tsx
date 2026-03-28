"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

interface RouteRedirectNoticeProps {
  label: string;
  to: string | null;
}

export function RouteRedirectNotice({ label, to }: RouteRedirectNoticeProps) {
  const router = useRouter();
  const lastTargetRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!to || typeof window === "undefined") {
      return;
    }

    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (currentPath === to || lastTargetRef.current === to) {
      return;
    }

    lastTargetRef.current = to;
    router.replace(to as Route);

    const fallbackTimer = window.setTimeout(() => {
      const nextPath = `${window.location.pathname}${window.location.search}`;
      if (nextPath !== to) {
        window.location.replace(to);
      }
    }, 120);

    const hardFallbackTimer = window.setTimeout(() => {
      const nextPath = `${window.location.pathname}${window.location.search}`;
      if (nextPath !== to) {
        window.location.assign(to);
      }
    }, 360);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(hardFallbackTimer);
    };
  }, [router, to]);

  return (
    <p className="helperText loadingRow">
      {label}
      {to ? <> 若没有自动跳转，<a href={to}>点这里继续</a>。</> : null}
    </p>
  );
}
