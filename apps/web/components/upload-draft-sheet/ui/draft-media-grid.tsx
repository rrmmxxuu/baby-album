import type { DraftDuplicateState, DraftMedia } from "../model/types";
import { DraftMediaThumb } from "./draft-media-thumb";

interface DraftMediaGridProps {
  draftId: string;
  duplicateItemStates: Record<string, DraftDuplicateState>;
  items: DraftMedia[];
  onAppendFiles: () => void;
  onRemoveItem: (draftId: string, itemId: string) => void;
}

export function DraftMediaGrid({ draftId, duplicateItemStates, items, onAppendFiles, onRemoveItem }: DraftMediaGridProps) {
  return (
    <div className={`draftEditorMedia draftEditorMedia${Math.min(items.length, 4)}`}>
      {items.map((item) => (
        <div className="draftEditorMediaCard draftPreviewSurface" key={item.id}>
          <DraftMediaThumb item={item} />
          {duplicateItemStates[item.id]?.status === "duplicate" ? <span className="draftDuplicateBadge">重复</span> : null}
          <div className="draftMediaActions">
            <button className="draftRemoveButton" onClick={() => onRemoveItem(draftId, item.id)} type="button">移除</button>
          </div>
        </div>
      ))}
      <button className="draftAddTile" onClick={onAppendFiles} type="button">添加</button>
    </div>
  );
}
