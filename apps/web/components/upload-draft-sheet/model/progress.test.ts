import { describe, expect, it } from "vitest";
import { formatBytes, formatTransferRate, progressPercent } from "./progress";

describe("upload progress helpers", () => {
  it("formats bytes and transfer rate", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatTransferRate(2048)).toBe("2.0 KB/s");
  });

  it("calculates progress percentage from bytes or file counts", () => {
    expect(progressPercent({
      title: "",
      detail: "",
      currentFileName: "",
      transferredBytes: 50,
      totalBytes: 200,
      completedFiles: 0,
      totalFiles: 0,
      bytesPerSecond: 0
    })).toBe(25);

    expect(progressPercent({
      title: "",
      detail: "",
      currentFileName: "",
      transferredBytes: 0,
      totalBytes: 0,
      completedFiles: 3,
      totalFiles: 4,
      bytesPerSecond: 0
    })).toBe(75);
  });
});
