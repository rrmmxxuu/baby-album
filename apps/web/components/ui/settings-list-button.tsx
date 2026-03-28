import type { ReactNode } from "react";

interface SettingsListButtonProps {
  className?: string;
  leading: ReactNode;
  primary: ReactNode;
  secondary: ReactNode;
  trailing?: ReactNode;
  onClick: () => void | Promise<void>;
}

export function SettingsListButton({ className, leading, primary, secondary, trailing, onClick }: SettingsListButtonProps) {
  return (
    <button className={className ? `settingsCardButton panel ${className}` : "settingsCardButton panel"} onClick={() => void onClick()} type="button">
      {leading}
      <span className="settingsCardBody">
        <span className="settingsMenuPrimary">{primary}</span>
        <span className="settingsMenuMeta">{secondary}</span>
      </span>
      {trailing ?? <span className="settingsMenuMeta">›</span>}
    </button>
  );
}
