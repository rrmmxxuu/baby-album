import Link from "next/link";
import type { Route } from "next";

type AppBottomNavKey = "photos" | "feeding" | "settings";

interface AppBottomNavProps {
  activeKey?: AppBottomNavKey | null;
  hidden?: boolean;
  photosHref: Route;
  feedingHref: Route;
  settingsHref: Route;
}

export function AppBottomNav({ activeKey, hidden, photosHref, feedingHref, settingsHref }: AppBottomNavProps) {
  return (
    <nav className={`bottomNav${hidden ? " bottomNavHidden" : ""}`}>
      <Link aria-current={activeKey === "photos" ? "page" : undefined} className={activeKey === "photos" ? "navActive" : ""} href={photosHref} prefetch scroll={false}>照片</Link>
      <Link aria-current={activeKey === "feeding" ? "page" : undefined} className={activeKey === "feeding" ? "navActive" : ""} href={feedingHref} prefetch scroll={false}>喂养</Link>
      <Link aria-current={activeKey === "settings" ? "page" : undefined} className={activeKey === "settings" ? "navActive" : ""} href={settingsHref} prefetch scroll={false}>设置</Link>
    </nav>
  );
}
