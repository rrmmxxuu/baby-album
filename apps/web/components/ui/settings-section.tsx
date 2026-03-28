import type { ReactNode } from "react";

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({ title, children, className }: SettingsSectionProps) {
  return (
    <article className={className ? `panelStack panel ${className}` : "panelStack panel"}>
      <p className="settingsCardTitle">{title}</p>
      {children}
    </article>
  );
}
