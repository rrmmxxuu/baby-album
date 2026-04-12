import type { TimelineTimeMode, TimelineVisibility } from "../../../lib/types";

export type DraftMedia = {
  id: string;
  file: File | null;
  fileName: string;
  previewUrl?: string;
  posterUrl?: string;
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

export type BackgroundUploadPhase = "idle" | "uploading" | "success" | "error";
export type BackgroundUploadSurface = "dialog" | "minimized";

export type BackgroundUploadJobMedia = {
  id: string;
  file: File | null;
  fileName: string;
  capturedAt: string;
  mediaType: string;
  existingMediaId?: string;
};

export type BackgroundUploadJobDraft = {
  id: string;
  caption: string;
  visibility: TimelineVisibility;
  timeMode: TimelineTimeMode;
  manualDate: string;
  items: BackgroundUploadJobMedia[];
};

export type BackgroundUploadJob = {
  albumId: string;
  mode: "create" | "edit";
  drafts: BackgroundUploadJobDraft[];
  editingEntryId?: string;
  originalMediaIds: string[];
  onUploaded?: () => void;
};

export type BackgroundUploadState = {
  phase: BackgroundUploadPhase;
  surface: BackgroundUploadSurface;
  progress: UploadProgressState | null;
  errorMessage: string;
  albumId: string;
};

export type DraftScene = "list" | "detail";
export type DraftModal = "batchSettings" | null;

export type DraftDuplicateStatus = "idle" | "probing" | "hashing" | "duplicate" | "unique" | "unsupported" | "error";

export type DraftDuplicateState = {
  status: DraftDuplicateStatus;
  duplicateCount: number;
};
