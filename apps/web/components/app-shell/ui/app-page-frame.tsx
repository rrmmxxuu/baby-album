import type { AlbumWorkspace, User } from "../../../lib/types";
import type { AppSessionState } from "../hooks/use-app-session";
import { AppFeedbackToasts } from "./app-feedback-toasts";
import { BootSplash } from "./boot-splash";
import { TopBar } from "./top-bar";

interface AppPageFrameProps {
  children: React.ReactNode;
  session: AppSessionState;
  currentUser: User | null;
  activeAlbum?: AlbumWorkspace | null;
  blocking?: boolean;
  showTopBar?: boolean;
  authenticated?: boolean;
  hasBottomNav?: boolean;
}

export function AppPageFrame({ children, session, currentUser, activeAlbum, blocking, showTopBar, authenticated, hasBottomNav }: AppPageFrameProps) {
  const showBootSplash = session.bootPhase !== "done" || blocking;
  const showAuthenticatedLayout = session.isAuthenticated && (authenticated || Boolean(activeAlbum));
  const reserveBottomNavSpace = hasBottomNav ?? showAuthenticatedLayout;

  return (
    <main className={`appShell${showAuthenticatedLayout ? " appShellAuthenticated" : ""}${showBootSplash ? " appShellBooting" : ""}`}>
      {showBootSplash ? <BootSplash phase={session.bootPhase === "exiting" && !blocking ? "exiting" : "loading"} /> : null}
      {showTopBar ? <TopBar currentUser={currentUser} /> : null}
      <AppFeedbackToasts
        feedback={session.feedback}
        offsetForBottomNav={reserveBottomNavSpace}
        onClearFeedback={session.clearFeedback}
      />
      {children}
    </main>
  );
}
