import type { DraftMedia } from "../model/types";

interface DraftMediaThumbProps {
  item: DraftMedia;
}

export function DraftMediaThumb({ item }: DraftMediaThumbProps) {
  if (item.mediaType.startsWith("video/")) {
    return (
      <div className="draftMediaThumb draftMediaThumbVideo">
        <video aria-label={item.fileName} className="draftMediaThumbVideoElement" muted playsInline preload="metadata" src={item.previewUrl} />
        <span aria-hidden="true" className="draftMediaThumbBadge">视频</span>
      </div>
    );
  }

  return <img alt={item.fileName} className="draftMediaThumbImage" src={item.previewUrl} />;
}
