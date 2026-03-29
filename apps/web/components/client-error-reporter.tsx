"use client";

import { useEffect, useRef } from "react";
import { ApiError, reportClientError } from "../lib/api";

interface StandaloneNavigator extends Navigator {
  standalone?: boolean;
}

interface NormalizedClientError {
  message: string;
  stack?: string;
  requestId?: string;
  extra?: Record<string, unknown>;
}

function displayModeLabel() {
  if (typeof window === "undefined") {
    return "unknown";
  }
  if (window.matchMedia?.("(display-mode: standalone)")?.matches) {
    return "standalone";
  }
  const navigatorWithStandalone = window.navigator as StandaloneNavigator;
  if (navigatorWithStandalone.standalone === true) {
    return "standalone";
  }
  return "browser";
}

function currentAlbumId() {
  if (typeof window === "undefined") {
    return "";
  }
  const match = window.location.pathname.match(/^\/album\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function normalizeClientError(error: unknown, fallbackMessage: string): NormalizedClientError {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      stack: error.stack,
      requestId: error.requestId,
      extra: {
        status: error.status
      }
    };
  }
  if (error instanceof Error) {
    const requestId = "requestId" in error && typeof (error as { requestId?: unknown }).requestId === "string"
      ? (error as { requestId: string }).requestId
      : "";
    return {
      message: error.message || fallbackMessage,
      stack: error.stack,
      requestId
    };
  }
  if (typeof error === "string" && error.trim()) {
    return { message: error };
  }
  return { message: fallbackMessage };
}

export function ClientErrorReporter() {
  const sentRef = useRef(new Map<string, number>());

  useEffect(() => {
    function send(kind: "error" | "unhandledrejection", normalized: NormalizedClientError) {
      const message = normalized.message.trim();
      if (!message || message.includes("/api/v1/client-errors")) {
        return;
      }
      if (message.includes("ResizeObserver loop")) {
        return;
      }
      const fingerprint = `${kind}:${window.location.pathname}:${message}`;
      const now = Date.now();
      const lastSentAt = sentRef.current.get(fingerprint) ?? 0;
      if (now - lastSentAt < 4000) {
        return;
      }
      sentRef.current.set(fingerprint, now);
      void reportClientError({
        message,
        stack: normalized.stack,
        requestId: normalized.requestId,
        path: `${window.location.pathname}${window.location.search}`,
        userAgent: window.navigator.userAgent,
        displayMode: displayModeLabel(),
        albumId: currentAlbumId(),
        extra: {
          kind,
          ...normalized.extra
        }
      }).catch(() => {
        // Keep error reporting fire-and-forget.
      });
    }

    function handleError(event: ErrorEvent) {
      const normalized = normalizeClientError(event.error, event.message || "发生未捕获错误。");
      if (!normalized.stack && event.filename) {
        normalized.stack = `${event.filename}:${event.lineno}:${event.colno}`;
      }
      send("error", normalized);
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      send("unhandledrejection", normalizeClientError(event.reason, "Promise 被拒绝但未处理。"));
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
