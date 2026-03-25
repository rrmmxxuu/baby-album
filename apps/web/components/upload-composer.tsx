"use client";

import { useState } from "react";

interface UploadComposerProps {
  familyId: string;
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

export function UploadComposer({ familyId, apiBaseUrl, authToken, disabled, onUploaded }: UploadComposerProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [capturedAt, setCapturedAt] = useState(new Date().toISOString());
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) {
      setStatus("请先连接家庭存储节点，再上传照片或视频。");
      return;
    }
    if (!selectedFile) {
      setStatus("请先选择一个照片或视频文件。");
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const createResponse = await fetch(`${apiBaseUrl}/api/v1/upload-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          familyId,
          fileName: selectedFile.name,
          mediaType: selectedFile.type || "application/octet-stream",
          capturedAt
        })
      });

      const createPayload = (await createResponse.json()) as { id?: string; error?: string };
      if (!createResponse.ok || !createPayload.id) {
        setStatus(createPayload.error ?? "创建上传任务失败。")
        return;
      }

      const formData = new FormData();
      formData.append("file", selectedFile);

      const uploadResponse = await fetch(`${apiBaseUrl}/api/v1/upload-sessions/${createPayload.id}/content`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`
        },
        body: formData
      });

      const uploadPayload = (await uploadResponse.json()) as { error?: string; status?: string };
      if (!uploadResponse.ok) {
        setStatus(uploadPayload.error ?? "上传文件内容失败。")
        return;
      }

      setStatus(`已上传 ${selectedFile.name}，当前状态：${uploadPayload.status ?? "uploaded"}。`);
      setSelectedFile(null);
      onUploaded?.();
    } catch {
      setStatus("上传失败，请检查浏览器是否能够访问 API 服务。");
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
        <span className="pill">云端缓存 -&gt; 存储节点</span>
      </div>

      <label>
        选择文件
        <input
          type="file"
          accept="image/*,video/*"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setSelectedFile(file);
            if (file) {
              setCapturedAt(toISOStringFromLastModified(file.lastModified));
            }
          }}
        />
      </label>

      <label>
        拍摄时间
        <input value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} />
      </label>

      <button disabled={submitting || disabled} type="submit">
        {submitting ? "上传中..." : "创建任务并上传"}
      </button>

      <p className="helperText">文件会先进入主控缓存，再由家庭存储节点下载并归档到相册库中。</p>

      {selectedFile ? <p className="helperText">已选择：{selectedFile.name} / {Math.ceil(selectedFile.size / 1024)} KB / {selectedFile.type || "application/octet-stream"}</p> : null}
      {status ? <p className="statusNote">{status}</p> : null}
    </form>
  );
}