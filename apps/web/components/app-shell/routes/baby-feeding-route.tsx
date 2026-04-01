"use client";

import { useRouter } from "next/navigation";
import { useBabyRouteContext } from "../baby-route-context";
import { buildFeedingHubPath } from "../model/routes";
import { BabyAvatar } from "../ui/baby-avatar";
import { formatDetailedBabyAge } from "../model/format";

export function BabyFeedingRoute() {
  const router = useRouter();
  const { workspace, appView } = useBabyRouteContext();
  const activeBaby = appView.activeBaby;

  return (
    <section className="pageStack">
      <article className="panel panelStack">
        <div className="settingsIdentityRow">
          <BabyAvatar albumId={workspace.album.id} baby={activeBaby} className="settingsCardAvatar settingsIdentityAvatar" />
          <div className="settingsIdentityBody">
            <strong>{activeBaby?.name ?? workspace.album.name}</strong>
            <p className="helperText">{activeBaby?.birthDate ? formatDetailedBabyAge(activeBaby.birthDate) : "还没有填写出生日期"}</p>
          </div>
        </div>
        <div>
          <p className="eyebrow">喂养</p>
          <h2>喂养入口已切到独立宝宝路由</h2>
          <p className="helperText">后续的喂养时间线、日期切换和记录表单会继续直接挂在这个页面上。当前先完成路由与入口行为重构。</p>
        </div>
        <button className="secondaryButton" onClick={() => router.push(buildFeedingHubPath())} type="button">重新选择宝宝</button>
      </article>
    </section>
  );
}
