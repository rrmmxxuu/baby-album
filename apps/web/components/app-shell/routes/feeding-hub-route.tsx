"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSessionContext } from "../app-session-provider";
import { feedingBabySummaries } from "../model/babies";
import { buildBabyFeedingPath } from "../model/routes";
import { FeedingRouteSkeleton } from "../ui/loading-skeletons";
import { SettingsHeader } from "../ui/settings-header";
import { SettingsListButton } from "../../ui/settings-list-button";
import { BabyAvatar } from "../ui/baby-avatar";
import { formatDetailedBabyAge, memberRelationLabel } from "../model/format";

export function FeedingHubRoute() {
  const router = useRouter();
  const session = useAppSessionContext();
  const feedingBabies = feedingBabySummaries(session.appState?.albums ?? []);

  useEffect(() => {
    if (session.bootPhase !== "done" || !session.isAuthenticated) {
      return;
    }
    if (!session.appState) {
      void session.refreshApp(undefined, { silent: true });
      return;
    }
    if (feedingBabies.length !== 1) {
      return;
    }
    router.replace(buildBabyFeedingPath(feedingBabies[0].baby.id), { scroll: false });
  }, [feedingBabies, router, session.appState, session.bootPhase, session.isAuthenticated, session.refreshApp]);

  return (
    <>
      {feedingBabies.length > 1 ? (
        <article className="panelStack settingsDetailPage settingsScene settingsSceneForward">
          <SettingsHeader eyebrow="喂养记录" title="选择宝宝" />
          <div className="stackList">
            {feedingBabies.map((item) => (
              <SettingsListButton
                key={item.baby.id}
                leading={<BabyAvatar albumId={item.album.id} baby={item.baby} className="settingsCardAvatar" />}
                onClick={() => router.push(buildBabyFeedingPath(item.baby.id))}
                primary={item.baby.name}
                secondary={item.baby.birthDate ? `${formatDetailedBabyAge(item.baby.birthDate)} · ${memberRelationLabel(item.membership)}` : memberRelationLabel(item.membership)}
              />
            ))}
          </div>
        </article>
      ) : null}

      {feedingBabies.length === 0 ? (
        <section className="pageStack">
          <article className="panel panelStack">
            <p className="eyebrow">喂养记录</p>
            <h2>暂无可记录的宝宝</h2>
            <p className="helperText">只有拥有“成员”及以上权限的宝宝才会出现在喂养列表中。</p>
          </article>
        </section>
      ) : null}

      {feedingBabies.length === 1 ? (
        <FeedingRouteSkeleton ariaLabel="正在进入喂养页" />
      ) : null}
    </>
  );
}
