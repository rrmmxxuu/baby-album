/// <reference lib="webworker" />

import { bytesToHex, sha256Hex } from "./sha256";

type HashWorkerRequest = {
  requestId: string;
  file: File;
};

type HashWorkerResponse =
  | { requestId: string; sha256: string }
  | { requestId: string; error: string };

self.onmessage = async (event: MessageEvent<HashWorkerRequest>) => {
  const { file, requestId } = event.data;
  try {
    const buffer = await file.arrayBuffer();
    const sha256 = crypto?.subtle
      ? bytesToHex(await crypto.subtle.digest("SHA-256", buffer))
      : sha256Hex(buffer);
    const payload: HashWorkerResponse = { requestId, sha256 };
    self.postMessage(payload);
  } catch (error) {
    const payload: HashWorkerResponse = {
      requestId,
      error: error instanceof Error ? error.message : "hash failed"
    };
    self.postMessage(payload);
  }
};

export {};
