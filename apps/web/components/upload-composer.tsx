"use client";

import { useMemo, useState } from "react";

interface UploadComposerProps {
  albumId: string;
  apiBaseUrl: string;
  authToken: string;
  disabled?: boolean;
  onUploaded?: () => void;
}

function toISOStringFromLastModified(value: number) {
  if (!value) {
    return new Date().toISOString();
  }
  return new Date(value).toISOString();
}

function createUploadBatchId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return `batch-${globalThis.crypto.randomUUID()}`;
  }
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `batch-${Date.now().toString(36)}-${randomPart}`;
}

function validateSelection(files: File[]) {
  if (files.length === 0) {
    return "请先选择照片或视频。";
  }
  const videoCount = files.filter((file) => file.type.startsWith("video/")).length;
  if (videoCount > 1) {
    return "每次只能上传 1 个视频。";
  }
  if (videoCount === 1 && files.length > 1) {
    return "视频必须单独上传，不能和照片混传。";
  }
  if (videoCount === 0 && files.length > 9) {
    return "每次最多上传 9 张照片。";
  }
  return null;
}

export function UploadComposer({ albumId, apiBaseUrl, authToken, disabled, onUploaded }: UploadComposerProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [capturedAtOverride, setCapturedAtOverride] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectionError = useMemo(() => validateSelection(selectedFiles), [selectedFiles]);
  const isVideoBatch = selectedFiles.length === 1 && selectedFiles[0]?.type.startsWith("video/");

  async function uploadSingleFile(file: File, uploadBatchId: string) {
    const capturedAt = capturedAtOverride || toISOStringFromLastModified(file.lastModified);
    const createResponse = await fetch(`${apiBaseUrl}/api/v1/upload-sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        albumId,
        uploadBatchId,
        fileName: file.name,
        mediaType: file.type || "application/octet-stream",
        capturedAt
      })
    });

    const createPayload = (await createResponse.json()) as { id?: string; error?: string };
    if (!createResponse.ok || !createPayload.id) {
      throw new Error(createPayload.error ?? `创建 ${file.name} 的上传任务失败。`);
    }

    const formData = new FormData();
    formData.append("file", file);

    const uploadResponse = await fetch(`${apiBaseUrl}/api/v1/upload-sessions/${createPayload.id}/content`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`
      },
      body: formData
    });

    const uploadPayload = (await uploadResponse.json()) as { error?: string };
    if (!uploadResponse.ok) {
      throw new Error(uploadPayload.error ?? `上传 ${file.name} 失败。`);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) {
      setStatus("请先连接 NAS，再上传照片或视频。");
      return;
    }
    if (selectionError) {
      setStatus(selectionError);
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const uploadBatchId = createUploadBatchId();
      for (const [index, file] of selectedFiles.entries()) {
        setStatus(`正在上传 ${index + 1} / ${selectedFiles.length}: ${file.name}`);
        await uploadSingleFile(file, uploadBatchId);
      }
      setStatus(`已完成 ${selectedFiles.length} 个文件上传。`);
      setSelectedFiles([]);
      setCapturedAtOverride("");
      onUploaded?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "上传失败，请检查浏览器是否能够访问 API 服务。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="panelStack" onSubmit={onSubmit}>
      <div className="sectionHeading">
        <div>
          <p className="eyebrow">上传</p>
          <h2>上传到宝宝时间线</h2>
        </div>
        <span className="pill">{isVideoBatch ? "单视频" : "最多 9 张照片"}</span>
      </div>

      <label>
        选择文件
        <input
          multiple
          type="file"
          accept="image/*,video/*"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            setSelectedFiles(files);
            if (files.length === 1) {
              setCapturedAtOverride(toISOStringFromLastModified(files[0].lastModified));
            } else {
              setCapturedAtOverride("");
            }
            setStatus(null);
          }}
        />
      </label>

      <label>
        拍摄时间覆盖
        <input placeholder="留空则按文件时间自动判断" value={capturedAtOverride} onChange={(event) => setCapturedAtOverride(event.target.value)} />
      </label>

      <button disabled={submitting || disabled} type="submit">
        {submitting ? "上传中..." : "创建任务并上传"}
      </button>

      <p className="helperText">照片支持每次最多 9 张；视频每次 1 个。系统会把同一次提交的内容归为一组展示在时间线里。</p>

      {selectedFiles.length > 0 ? <p className="helperText">已选择 {selectedFiles.length} 个文件，总大小约 {Math.ceil(selectedFiles.reduce((sum, file) => sum + file.size, 0) / 1024)} KB。</p> : null}
      {selectionError ? <p className="helperText">{selectionError}</p> : null}
      {status ? <p className="statusNote">{status}</p> : null}
    </form>
  );
}
