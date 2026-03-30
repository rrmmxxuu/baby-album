import type { MediaAsset } from "../../../lib/types";
import { MomentThumb } from "./moment-thumb";

interface MomentVideoProps {
  albumId: string;
  item: MediaAsset;
  onOpen: () => void;
}

export function MomentVideo({ albumId, item, onOpen }: MomentVideoProps) {
  return (
    <div className="momentVideo">
      <MomentThumb albumId={albumId} item={item} large onOpen={onOpen} />
      <div aria-hidden="true" className="momentVideoPlay">
        <span className="momentVideoPlayTriangle" />
      </div>
    </div>
  );
}
