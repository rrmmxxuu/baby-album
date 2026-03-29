import type { TimelineTimeMode, TimelineVisibility } from "../../../lib/types";

export type DraftMedia = {
  id: string;
  file: File | null;
  fileName: string;
  previewUrl: string;
  capturedAt: string;
  mediaType: string;
  existingMediaId?: string;
  localPreview?: boolean;
};

export type UploadDraft = {
  id: string;
  caption: string;
  visibility: TimelineVisibility;
  timeMode: TimelineTimeMode;
  manualDate: string;
  items: DraftMedia[];
};

export type UploadProgressState = {
  title: string;
  detail: string;
  currentFileName: string;
  transferredBytes: number;
  totalBytes: number;
  completedFiles: number;
  totalFiles: number;
  bytesPerSecond: number;
};

export type DraftScene = "list" | "detail";
export type DraftModal = "batchSettings" | null;

export type DraftDuplicateStatus = "idle" | "probing" | "hashing" | "duplicate" | "unique" | "unsupported" | "error";

export type DraftDuplicateState = {
  status: DraftDuplicateStatus;
  duplicateCount: number;
};
