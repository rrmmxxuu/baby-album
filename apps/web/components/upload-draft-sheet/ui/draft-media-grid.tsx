import type { DraftMedia } from "../model/types";

interface DraftMediaGridProps {
  draftId: string;
  items: DraftMedia[];
  onAppendFiles: () => void;
  onRemoveItem: (draftId: string, itemId: string) => void;
}

export function DraftMediaGrid({ draftId, items, onAppendFiles, onRemoveItem }: DraftMediaGridProps) {
  return (
    <div className={`draftEditorMedia draftEditorMedia${Math.min(items.length, 4)}`}>
      {items.map((item) => (
        <div className="draftEditorMediaCard draftPreviewSurface" key={item.id}>
          <img alt={item.fileName} src={item.previewUrl} />
          <div className="draftMediaActions">
            <button className="draftRemoveButton" onClick={() => onRemoveItem(draftId, item.id)} type="button">移除</button>
          </div>
        </div>
      ))}
      <button className="draftAddTile" onClick={onAppendFiles} type="button">添加</button>
    </div>
  );
}
