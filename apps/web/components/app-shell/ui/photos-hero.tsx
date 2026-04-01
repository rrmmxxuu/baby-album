import type { AlbumSummary, AlbumWorkspace, BabyProfile } from "../../../lib/types";
import { formatDate, formatDetailedBabyAge } from "../model/format";
import { BabyAvatar } from "./baby-avatar";

interface PhotosHeroProps {
  activeAlbum: AlbumWorkspace;
  activeBaby: BabyProfile | null;
  albumOptions: AlbumSummary[];
  timelineCount: number;
  timelineLoading: boolean;
  onAlbumChange: (albumId: string) => void;
}

export function PhotosHero({ activeAlbum, activeBaby, albumOptions, timelineCount, timelineLoading, onAlbumChange }: PhotosHeroProps) {
  const birthSummary = activeBaby?.birthDate
    ? `${formatDate(activeBaby.birthDate)} · ${formatDetailedBabyAge(activeBaby.birthDate)}`
    : "还没有填写出生日期";
  const currentSelectionValue = activeBaby?.id ?? activeAlbum.baby?.id ?? activeAlbum.album.id;

  return (
    <article className="momentsHero panel">
      <div className="momentsHeroBackdrop" />
      <div className="momentsHeroBody">
        <BabyAvatar albumId={activeAlbum.album.id} baby={activeBaby} className="momentsHeroAvatar" />
        <div className="momentsHeroCopy">
          <h2>{activeBaby?.name ?? activeAlbum.album.name}</h2>
          <p className="momentsHeroMeta">{birthSummary}</p>
        </div>
        <div className="momentsHeroAside">
          <p className="momentsHeroMeta">{timelineLoading && timelineCount === 0 ? "正在加载" : `${timelineCount} 条内容`}</p>
          <select className="heroAlbumSelect" value={currentSelectionValue} onChange={(event) => onAlbumChange(event.target.value)}>
            {albumOptions.map((item) => (
              <option key={item.baby?.id ?? item.album.id} value={item.baby?.id ?? item.album.id}>
                {item.baby?.name ?? item.album.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </article>
  );
}
