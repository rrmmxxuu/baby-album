import { getPreviewUrl } from "../../../lib/api";
import type { TimelineEntry, TimelineTimeMode, TimelineVisibility } from "../../../lib/types";
import type { DraftMedia, UploadDraft } from "./types";

export function createClientId(prefix: string) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function toCapturedAt(file: File) {
  return new Date(file.lastModified || Date.now()).toISOString();
}

export function toLocalDay(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function draftDayLabel(value: string) {
  const target = new Date(`${value}T00:00:00`);
  const now = new Date();
  if (target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth() && target.getDate() === now.getDate()) {
    return "今天";
  }
  return value;
}

export function chunkItems<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function buildDrafts(files: File[]) {
  const drafts: UploadDraft[] = [];
  const photosByDay = new Map<string, DraftMedia[]>();

  for (const file of files) {
    const capturedAt = toCapturedAt(file);
    const media: DraftMedia = {
      id: createClientId("media"),
      file,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      capturedAt,
      mediaType: file.type || "application/octet-stream",
      localPreview: true
    };
    if (media.mediaType.startsWith("video/")) {
      drafts.push({
        id: createClientId("draft"),
        caption: "",
        visibility: "members",
        timeMode: "captured_at",
        manualDate: toLocalDay(capturedAt),
        items: [media]
      });
      continue;
    }
    const day = toLocalDay(capturedAt);
    const existing = photosByDay.get(day) ?? [];
    existing.push(media);
    photosByDay.set(day, existing);
  }

  for (const [day, items] of Array.from(photosByDay.entries()).sort((left, right) => right[0].localeCompare(left[0]))) {
    for (const group of chunkItems(items, 9)) {
      drafts.push({
        id: createClientId("draft"),
        caption: "",
        visibility: "members",
        timeMode: "captured_at",
        manualDate: day,
        items: group.sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
      });
    }
  }

  return drafts.sort((left, right) => draftDisplayAt(right).localeCompare(draftDisplayAt(left)));
}

export function buildDraftFromEntry(entry: TimelineEntry, albumId: string): UploadDraft {
  return {
    id: entry.id,
    caption: entry.caption,
    visibility: entry.visibility,
    timeMode: entry.timeMode,
    manualDate: entry.timelineDay,
    items: entry.items.map((item) => ({
      id: createClientId("media"),
      file: null,
      fileName: item.fileName,
      previewUrl: item.previewUrl || getPreviewUrl(item.id, albumId, item.processedAt ?? item.uploadedAt),
      capturedAt: item.capturedAt,
      mediaType: item.mediaType,
      existingMediaId: item.id
    }))
  };
}

export function mergeDrafts(existingDrafts: UploadDraft[], incomingDrafts: UploadDraft[]) {
  const merged: UploadDraft[] = existingDrafts.map((draft) => ({
    ...draft,
    items: [...draft.items]
  }));

  for (const incoming of incomingDrafts) {
    const isSingleVideo = incoming.items.length === 1 && incoming.items[0].mediaType.startsWith("video/");
    if (isSingleVideo) {
      merged.push(incoming);
      continue;
    }

    const targetDrafts = merged
      .filter((draft) => draft.timeMode === "captured_at" && draft.manualDate === incoming.manualDate && draft.items.every((item) => !item.mediaType.startsWith("video/")))
      .sort((left, right) => left.items.length - right.items.length);

    for (const item of incoming.items) {
      const target = targetDrafts.find((draft) => draft.items.length < 9);
      if (target) {
        target.items.push(item);
      } else {
        const nextDraft: UploadDraft = {
          ...incoming,
          id: createClientId("draft"),
          items: [item]
        };
        merged.push(nextDraft);
        targetDrafts.push(nextDraft);
      }
    }
  }

  for (const draft of merged) {
    draft.items.sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  }
  return merged.sort((left, right) => draftDisplayAt(right).localeCompare(draftDisplayAt(left)));
}

export function draftDisplayAt(draft: UploadDraft) {
  switch (draft.timeMode) {
    case "uploaded_at":
      return new Date().toISOString();
    case "manual":
      return new Date(`${draft.manualDate}T12:00:00`).toISOString();
    default:
      return [...draft.items].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))[0]?.capturedAt ?? new Date().toISOString();
  }
}

export function visibilityLabel(value: TimelineVisibility) {
  return value === "managers" ? "仅管理员和创建者" : "相册成员可见";
}

export function timeModeLabel(value: TimelineTimeMode) {
  switch (value) {
    case "uploaded_at":
      return "按当前时间";
    case "manual":
      return "手动选择日期";
    default:
      return "按拍摄时间";
  }
}

export function revokeDrafts(items: UploadDraft[]) {
  for (const draft of items) {
    for (const item of draft.items) {
      if (item.localPreview) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
  }
}
