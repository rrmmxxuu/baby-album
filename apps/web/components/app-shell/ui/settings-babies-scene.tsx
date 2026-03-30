import type { AlbumSummary } from "../../../lib/types";
import { memberRelationLabel } from "../model/format";
import { BabyAvatar } from "./baby-avatar";
import { SettingsHeader } from "./settings-header";
import { SettingsListButton } from "../../ui/settings-list-button";

interface SettingsBabiesSceneProps {
  className: string;
  albumOptions: AlbumSummary[];
  onBack: () => void;
  onAdd: () => void;
  onOpenAlbumSettings: (albumId: string) => void | Promise<void>;
}

export function SettingsBabiesScene({ className, albumOptions, onBack, onAdd, onOpenAlbumSettings }: SettingsBabiesSceneProps) {
  return (
    <article className={className}>
      <SettingsHeader actionLabel="添加" eyebrow="宝宝管理" onAction={onAdd} onBack={onBack} title="已加入的宝宝" />
      <div className="stackList">
        {albumOptions.map((item) => (
          <SettingsListButton
            key={item.album.id}
            leading={<BabyAvatar albumId={item.album.id} baby={item.baby ?? null} className="settingsCardAvatar" />}
            onClick={() => onOpenAlbumSettings(item.album.id)}
            primary={item.baby?.name ?? item.album.name}
            secondary={memberRelationLabel(item.membership)}
          />
        ))}
      </div>
    </article>
  );
}
