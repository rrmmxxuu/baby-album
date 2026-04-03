import type { MediaAsset } from "../../../lib/types";
import { MomentThumb } from "./moment-thumb";

interface MomentVideoProps {
  albumId: string;
  item: MediaAsset;
  onOpen: () => void;
  onPreviewRepair?: (media: MediaAsset) => void;
}

export function MomentVideo({ albumId, item, onOpen, onPreviewRepair }: MomentVideoProps) {
  return (
    <div className="momentVideo">
      <MomentThumb albumId={albumId} item={item} large onOpen={onOpen} onPreviewRepair={onPreviewRepair} />
      <div aria-hidden="true" className="momentVideoPlay">
        <span className="momentVideoPlayTriangle" />
      </div>
    </div>
  );
}
