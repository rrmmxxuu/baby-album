import type { UploadProgressState } from "./types";

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatTransferRate(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "--";
  }
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function progressPercent(progress: UploadProgressState) {
  if (progress.totalBytes > 0) {
    return Math.min(100, Math.round((progress.transferredBytes / progress.totalBytes) * 100));
  }
  if (progress.totalFiles > 0) {
    return Math.min(100, Math.round((progress.completedFiles / progress.totalFiles) * 100));
  }
  return 0;
}
