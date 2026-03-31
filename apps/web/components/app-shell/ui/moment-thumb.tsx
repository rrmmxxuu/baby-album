import { getPreviewUrl } from "../../../lib/api";
import type { MediaAsset } from "../../../lib/types";

interface MomentThumbProps {
  albumId: string;
  item: MediaAsset;
  large?: boolean;
  onOpen?: () => void;
}

export function MomentThumb({ albumId, item, large, onOpen }: MomentThumbProps) {
  const previewUrl = item.previewUrl || getPreviewUrl(item.id, albumId, item.processedAt ?? item.uploadedAt);
  return (
    <button className={`momentThumb${large ? " momentThumbLarge" : ""}`} onClick={onOpen} type="button">
      {item.previewStatus === "ready" ? (
        <img alt={item.fileName} className="momentThumbImage" decoding="async" loading="lazy" src={previewUrl} />
      ) : (
        <div className="momentThumbFallback">{item.mediaType.startsWith("video") ? "视频" : "照片"}</div>
      )}
    </button>
  );
}
