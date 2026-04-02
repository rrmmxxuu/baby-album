"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { joinedBabySummaries } from "../model/babies";
import { babyAvatarText } from "../model/format";
import { buildAuthPath, buildSettingsAccountPath, buildSettingsBabiesPath } from "../model/routes";
import { useWorkspaceScrollReset } from "../workspace-viewport";
import { useAppSessionContext } from "../app-session-provider";
import { SettingsMenuItem } from "../../ui/settings-menu-item";

export function SettingsHomeRoute() {
  const router = useRouter();
  const session = useAppSessionContext();
  const refreshApp = session.refreshApp;
  const currentUser = session.appState?.currentUser ?? null;
  const joinedBabies = joinedBabySummaries(session.appState?.albums ?? []);

  useWorkspaceScrollReset();

  useEffect(() => {
    if (!session.isAuthenticated) {
      return;
    }
    void refreshApp(undefined, { silent: true });
  }, [refreshApp, session.isAuthenticated]);

  function handleLogout() {
    void session.handleLogout();
    router.replace(buildAuthPath());
  }

  return (
    <section className="pageStack settingsPage">
      <article className="settingsHero panel">
        <div className="settingsHeroBackdrop" />
        <div className="settingsHeroBody">
          <div className="settingsHeroCopy">
            <p className="eyebrow">设置</p>
            <h2>管理账号和宝宝空间</h2>
          </div>
          <div className="sessionBadge settingsSessionBadge">
            <strong>{currentUser?.displayName ?? "家人"}</strong>
            <span>{currentUser?.email ?? ""}</span>
            <span>已加入 {joinedBabies.length} 个宝宝空间</span>
          </div>
        </div>
      </article>

      <article className="settingsMenu">
        <SettingsMenuItem onClick={() => router.push(buildSettingsAccountPath())} primary="账户管理" secondary="查看当前登录账号信息" trailing={<span className="settingsCardAvatar">{babyAvatarText(currentUser?.displayName)}</span>} />
        <SettingsMenuItem onClick={() => router.push(buildSettingsBabiesPath())} primary="宝宝管理" secondary="查看、切换、进入宝宝空间管理页" />
        <SettingsMenuItem danger onClick={handleLogout} primary="退出登录" secondary="清除当前设备上的登录状态" />
      </article>
    </section>
  );
}
