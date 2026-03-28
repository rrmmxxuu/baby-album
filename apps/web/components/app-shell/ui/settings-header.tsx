interface SettingsHeaderProps {
  eyebrow: string;
  onBack: () => void;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SettingsHeader({ eyebrow, onBack, title, actionLabel, onAction }: SettingsHeaderProps) {
  return (
    <header className="settingsNavBar">
      <button className="draftTopAction settingsNavBack" onClick={onBack} type="button">返回</button>
      <div className="settingsNavTitle">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {actionLabel && onAction ? (
        <button className="draftTopPrimary settingsNavAction" onClick={onAction} type="button">{actionLabel}</button>
      ) : (
        <span className="settingsNavSpacer" />
      )}
    </header>
  );
}
