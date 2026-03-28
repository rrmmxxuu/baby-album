import type { User } from "../../../lib/types";

interface TopBarProps {
  currentUser: User | null;
}

export function TopBar({ currentUser }: TopBarProps) {
  return (
    <section className="topBar panel">
      <div>
        <p className="eyebrow">宝宝相册</p>
        <h1>宝宝相册</h1>
        <p className="helperText">自部署、重视隐私的宝宝照片与视频时间线。</p>
      </div>
      {currentUser ? (
        <div className="sessionBadge">
          <strong>{currentUser.displayName}</strong>
          <span>{currentUser.email}</span>
        </div>
      ) : null}
    </section>
  );
}
