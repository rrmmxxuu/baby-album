import type { MediaAsset } from "../../../lib/types";
import { MomentThumb } from "./moment-thumb";

interface MomentVideoProps {
  authToken: string;
  albumId: string;
  item: MediaAsset;
  onOpen: () => void;
}

export function MomentVideo({ authToken, albumId, item, onOpen }: MomentVideoProps) {
  return (
    <div className="momentVideo">
      <MomentThumb albumId={albumId} authToken={authToken} item={item} large onOpen={onOpen} />
      <div aria-hidden="true" className="momentVideoPlay">
        <span className="momentVideoPlayTriangle" />
      </div>
    </div>
  );
}
