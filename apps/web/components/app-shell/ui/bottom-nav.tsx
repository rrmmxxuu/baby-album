import type { TabKey } from "../model/types";

interface BottomNavProps {
  activeTab: TabKey;
  hidden?: boolean;
  onChange: (tab: TabKey) => void;
}

export function BottomNav({ activeTab, hidden, onChange }: BottomNavProps) {
  return (
    <nav className={`bottomNav${hidden ? " bottomNavHidden" : ""}`}>
      <button className={activeTab === "photos" ? "navActive" : ""} onClick={() => onChange("photos")} type="button">照片</button>
      <button className={activeTab === "settings" ? "navActive" : ""} onClick={() => onChange("settings")} type="button">设置</button>
    </nav>
  );
}
