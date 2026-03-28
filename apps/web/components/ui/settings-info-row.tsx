import type { ReactNode } from "react";

interface SettingsInfoRowProps {
  label: string;
  value: ReactNode;
}

export function SettingsInfoRow({ label, value }: SettingsInfoRowProps) {
  return (
    <div className="settingsInfoRow">
      <span className="helperText">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
