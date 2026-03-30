import type { ReactNode } from "react";

interface SettingsMenuItemProps {
  primary: string;
  secondary: string;
  onClick: () => void;
  trailing?: ReactNode;
  danger?: boolean;
}

export function SettingsMenuItem({ primary, secondary, onClick, trailing, danger }: SettingsMenuItemProps) {
  return (
    <button className={`settingsMenuItem surfaceCard surfaceCardAction${danger ? " settingsMenuDanger" : ""}`} onClick={onClick} type="button">
      <span className="settingsMenuBody">
        <span className="settingsMenuPrimary">{primary}</span>
        <span className="settingsMenuMeta">{secondary}</span>
      </span>
      {trailing ?? <span className="settingsChevron">›</span>}
    </button>
  );
}
