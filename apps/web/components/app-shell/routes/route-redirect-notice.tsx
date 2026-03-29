"use client";

import Link from "next/link";
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
    const retryTimer = window.setTimeout(() => {
      const nextPath = `${window.location.pathname}${window.location.search}`;
      if (nextPath !== to) {
        router.replace(to as Route);
      }
    }, 120);

    return () => {
      window.clearTimeout(retryTimer);
    };
  }, [router, to]);

  return (
    <p className="helperText loadingRow">
      {label}
      {to ? <> 若没有自动跳转，<Link href={to as Route} replace scroll={false}>点这里继续</Link>。</> : null}
    </p>
  );
}
