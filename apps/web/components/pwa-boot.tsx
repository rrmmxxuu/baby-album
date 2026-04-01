"use client";

import { useEffect, useRef, useState } from "react";

export function PwaBoot() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let mounted = true;
    let visibilityHandler: (() => void) | null = null;
    let controllerHandler: (() => void) | null = null;

    function markWaiting(registration: ServiceWorkerRegistration) {
      if (!mounted || !registration.waiting) {
        return;
      }
      setWaitingWorker(registration.waiting);
    }

    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (!registration) {
        return;
      }
      markWaiting(registration);
      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) {
          return;
        }
        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            markWaiting(registration);
          }
        });
      });

      visibilityHandler = () => {
        if (document.visibilityState === "visible") {
          void registration.update().catch(() => {
            // Ignore passive update checks.
          });
        }
      };
      document.addEventListener("visibilitychange", visibilityHandler);
    }).catch((error) => {
      console.error("register service worker failed", error);
    });

    controllerHandler = () => {
      if (refreshingRef.current) {
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerHandler);

    return () => {
      mounted = false;
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      if (controllerHandler) {
        navigator.serviceWorker.removeEventListener("controllerchange", controllerHandler);
      }
    };
  }, []);

  function handleApplyUpdate() {
    if (!waitingWorker || refreshing) {
      return;
    }
    setRefreshing(true);
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  return waitingWorker ? (
    <div className="feedbackStack">
      <section className="feedbackToast feedbackToastSuccess" role="status">
        <div className="feedbackToastBody">
          <p className="feedbackToastTitle">发现新版本</p>
          <p className="feedbackToastMessage">刷新后可获取最新修复和改进。</p>
        </div>
        <button className="feedbackToastClose" disabled={refreshing} onClick={handleApplyUpdate} type="button">
          {refreshing ? "刷新中..." : "立即刷新"}
        </button>
      </section>
    </div>
  ) : null;
}
