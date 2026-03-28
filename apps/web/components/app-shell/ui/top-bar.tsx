import type { User } from "../../../lib/types";

interface TopBarProps {
  currentUser: User | null;
}

export function TopBar({ currentUser }: TopBarProps) {
  if (!currentUser) {
    return null;
  }

  return (
    <section className="topBar panel">
      <div className="sessionBadge">
        <strong>{currentUser.displayName}</strong>
        <span>{currentUser.email}</span>
      </div>
    </section>
  );
}
