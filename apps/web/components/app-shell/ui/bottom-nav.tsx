import Link from "next/link";
import type { Route } from "next";
import type { MouseEvent } from "react";
import type { TabKey } from "../model/types";

interface BottomNavProps {
  activeTab: TabKey;
  hidden?: boolean;
  photosHref: Route;
  settingsHref: Route;
  onNavigate: (tab: TabKey) => void;
  onPrefetch: (tab: TabKey) => void;
}

export function BottomNav({ activeTab, hidden, photosHref, settingsHref, onNavigate, onPrefetch }: BottomNavProps) {
  function bindLink(tab: TabKey) {
    return {
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        if (activeTab === tab) {
          return;
        }
        onNavigate(tab);
      },
      onMouseEnter: () => {
        if (activeTab !== tab) {
          onPrefetch(tab);
        }
      },
      onTouchStart: () => {
        if (activeTab !== tab) {
          onPrefetch(tab);
        }
      }
    };
  }

  return (
    <nav className={`bottomNav${hidden ? " bottomNavHidden" : ""}`}>
      <Link aria-current={activeTab === "photos" ? "page" : undefined} className={activeTab === "photos" ? "navActive" : ""} href={photosHref} prefetch scroll={false} {...bindLink("photos")}>照片</Link>
      <Link aria-current={activeTab === "settings" ? "page" : undefined} className={activeTab === "settings" ? "navActive" : ""} href={settingsHref} prefetch scroll={false} {...bindLink("settings")}>设置</Link>
    </nav>
  );
}
