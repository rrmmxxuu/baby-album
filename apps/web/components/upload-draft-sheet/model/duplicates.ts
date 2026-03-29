import type { DraftDuplicateState, DraftMedia, UploadDraft } from "./types";

export interface DraftDuplicateTarget {
  draftId: string;
  itemId: string;
  file: File;
  fileKey: string;
}

export function isDuplicateCheckableMedia(item: DraftMedia) {
  return Boolean(item.file) && item.mediaType.startsWith("image/");
}

export function draftDuplicateFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function collectDraftDuplicateTargets(drafts: UploadDraft[]) {
  const targets: DraftDuplicateTarget[] = [];
  for (const draft of drafts) {
    for (const item of draft.items) {
      if (!item.file || !isDuplicateCheckableMedia(item)) {
        continue;
      }
      targets.push({
        draftId: draft.id,
        itemId: item.id,
        file: item.file,
        fileKey: draftDuplicateFileKey(item.file)
      });
    }
  }
  return targets;
}

export function buildDuplicateTargetSignature(targets: DraftDuplicateTarget[]) {
  return targets.map((target) => `${target.draftId}:${target.itemId}:${target.fileKey}`).join("|");
}

export function countDraftDuplicates(draft: UploadDraft, itemStates: Record<string, DraftDuplicateState>) {
  return draft.items.reduce((count, item) => count + (itemStates[item.id]?.status === "duplicate" ? 1 : 0), 0);
}

export function duplicateSummaryText(count: number) {
  return count > 0 ? `已上传 ${count} 张` : "";
}
