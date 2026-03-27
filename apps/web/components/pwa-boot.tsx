"use client";

import { useEffect } from "react";

export function PwaBoot() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("register service worker failed", error);
    });
  }, []);

  return null;
}
