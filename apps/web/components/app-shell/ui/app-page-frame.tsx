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
  showTopBar?: boolean;
}

export function AppPageFrame({ children, session, currentUser, activeAlbum, showTopBar }: AppPageFrameProps) {
  return (
    <main className={`appShell${session.authToken && activeAlbum ? " appShellAuthenticated" : ""}${session.bootPhase !== "done" ? " appShellBooting" : ""}`}>
      {session.bootPhase !== "done" ? <BootSplash phase={session.bootPhase === "exiting" ? "exiting" : "loading"} /> : null}
      {showTopBar ? <TopBar currentUser={currentUser} /> : null}
      <AppFeedbackToasts
        feedback={session.feedback}
        offsetForBottomNav={Boolean(session.authToken && activeAlbum)}
        onClearFeedback={session.clearFeedback}
      />
      {children}
    </main>
  );
}
