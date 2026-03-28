import type { ReactNode } from "react";

interface StorageSectionProps {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}

export function StorageSection({ title, subtitle, action, children }: StorageSectionProps) {
  return (
    <article className="panelStack panel">
      <div className="storageSectionHeader">
        <div>
          <p className="settingsCardTitle">{title}</p>
          <strong>{subtitle}</strong>
        </div>
        {action}
      </div>
      {children}
    </article>
  );
}
