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
      setStatus("Connect a NAS storage node before uploading media.");
      return;
    }
    if (!selectedFile) {
      setStatus("Pick a photo or video first.");
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
        setStatus(createPayload.error ?? "Failed to create upload session.");
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
        setStatus(uploadPayload.error ?? "Failed to upload file content.");
        return;
      }

      setStatus(`Uploaded ${selectedFile.name}. Session is now ${uploadPayload.status ?? "uploaded"}.`);
      setSelectedFile(null);
      onUploaded?.();
    } catch {
      setStatus("Upload failed. Check that the API is reachable from this browser.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="panelStack" onSubmit={onSubmit}>
      <div className="sectionHeading">
        <div>
          <p className="eyebrow">Upload</p>
          <h2>Send media to the family timeline</h2>
        </div>
        <span className="pill">Blob -&gt; Agent</span>
      </div>

      <label>
        File
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
        Captured At
        <input value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} />
      </label>

      <button disabled={submitting || disabled} type="submit">
        {submitting ? "Uploading..." : "Create session and upload"}
      </button>

      <p className="helperText">
        Files land in the control plane cache first, then the NAS agent downloads and stores them in the family library.
      </p>

      {selectedFile ? (
        <p className="helperText">
          Selected: {selectedFile.name} · {Math.ceil(selectedFile.size / 1024)} KB · {selectedFile.type || "application/octet-stream"}
        </p>
      ) : null}

      {status ? <p className="statusNote">{status}</p> : null}
    </form>
  );
}