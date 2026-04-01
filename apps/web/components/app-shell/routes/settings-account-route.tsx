"use client";

import { useRouter } from "next/navigation";
import { joinedBabySummaries } from "../model/babies";
import { babyAvatarText } from "../model/format";
import { buildFeedingHubPath, buildPhotosHubPath, buildSettingsPath } from "../model/routes";
import { useAppSessionContext } from "../app-session-provider";
import { AuthenticatedShell } from "../ui/authenticated-shell";
import { SettingsHeader } from "../ui/settings-header";
import { SettingsSection } from "../../ui/settings-section";
import { SettingsInfoRow } from "../../ui/settings-info-row";

export function SettingsAccountRoute() {
  const router = useRouter();
  const session = useAppSessionContext();
  const currentUser = session.appState?.currentUser ?? null;
  const joinedBabies = joinedBabySummaries(session.appState?.albums ?? []);

  return (
    <AuthenticatedShell
      activeNav="settings"
      feedingHref={buildFeedingHubPath()}
      photosHref={buildPhotosHubPath()}
      settingsHref={buildSettingsPath()}
    >
      <article className="panelStack settingsDetailPage settingsScene settingsSceneForward">
        <SettingsHeader eyebrow="账户管理" onBack={() => router.push(buildSettingsPath())} title="账户信息" />
        <SettingsSection title="账户概览">
          <div className="settingsIdentityRow">
            <span aria-hidden="true" className="settingsCardAvatar settingsIdentityAvatar">{babyAvatarText(currentUser?.displayName)}</span>
            <div className="settingsIdentityBody">
              <strong>{currentUser?.displayName ?? "家人"}</strong>
              <p className="helperText">{currentUser?.email ?? ""}</p>
            </div>
          </div>
          <div className="settingsInfoList">
            <SettingsInfoRow label="已加入宝宝数" value={`${joinedBabies.length}`} />
            <SettingsInfoRow label="登录状态" value={session.isAuthenticated ? "已登录" : "未登录"} />
          </div>
        </SettingsSection>
      </article>
    </AuthenticatedShell>
  );
}
