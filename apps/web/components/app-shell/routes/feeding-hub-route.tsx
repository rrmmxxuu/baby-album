"use client";

import { useRouter } from "next/navigation";
import { useAppSessionContext } from "../app-session-provider";
import { feedingBabySummaries } from "../model/babies";
import { buildBabyFeedingPath } from "../model/routes";
import { SettingsHeader } from "../ui/settings-header";
import { SettingsListButton } from "../../ui/settings-list-button";
import { BabyAvatar } from "../ui/baby-avatar";
import { formatDetailedBabyAge, memberRelationLabel } from "../model/format";

export function FeedingHubRoute() {
  const router = useRouter();
  const session = useAppSessionContext();
  const feedingBabies = feedingBabySummaries(session.appState?.albums ?? []);

  return (
    <>
      {feedingBabies.length > 0 ? (
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
    </>
  );
}
