import type { AlbumSummary, AlbumWorkspace, BabyProfile } from "../../../lib/types";
import { formatBirthSummary } from "../model/format";
import { BabyAvatar } from "./baby-avatar";

interface PhotosHeroProps {
  activeAlbum: AlbumWorkspace;
  activeBaby: BabyProfile | null;
  albumOptions: AlbumSummary[];
  authToken: string;
  timelineCount: number;
  timelineLoading: boolean;
  onAlbumChange: (albumId: string) => void;
}

export function PhotosHero({ activeAlbum, activeBaby, albumOptions, authToken, timelineCount, timelineLoading, onAlbumChange }: PhotosHeroProps) {
  return (
    <article className="momentsHero panel">
      <div className="momentsHeroBackdrop" />
      <div className="momentsHeroBody">
        <BabyAvatar albumId={activeAlbum.album.id} baby={activeBaby} className="momentsHeroAvatar" token={authToken} />
        <div className="momentsHeroCopy">
          <h2>{activeBaby?.name ?? activeAlbum.album.name}</h2>
          <p className="momentsHeroMeta">{activeBaby?.birthDate ? formatBirthSummary(activeBaby.birthDate) : "还没有填写出生日期"}</p>
        </div>
        <div className="momentsHeroAside">
          <p className="momentsHeroMeta">{timelineLoading && timelineCount === 0 ? "正在加载" : `${timelineCount} 条内容`}</p>
          <select className="heroAlbumSelect" value={activeAlbum.album.id} onChange={(event) => onAlbumChange(event.target.value)}>
            {albumOptions.map((item) => (
              <option key={item.album.id} value={item.album.id}>
                {item.baby?.name ?? item.album.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </article>
  );
}
