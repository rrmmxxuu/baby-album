"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { probeDuplicateMedia, resolveDuplicateMedia } from "../../../lib/api";
import { chunkItems } from "../model/drafts";
import { buildDuplicateTargetSignature, collectDraftDuplicateTargets } from "../model/duplicates";
import { isIosWebKit } from "../model/platform";
import { bytesToHex, sha256Hex } from "../model/sha256";
import type { DraftDuplicateState, UploadDraft } from "../model/types";

const PROBE_BATCH_SIZE = 200;
const RESOLVE_BATCH_SIZE = 100;
const LARGE_IOS_DUPLICATE_DELAY_THRESHOLD = 30;
const IOS_DUPLICATE_CHECK_DELAY_MS = 180;

interface UseDraftDuplicateCheckOptions {
  albumId: string;
  open: boolean;
  drafts: UploadDraft[];
}

type HashWorkerMessage =
  | { requestId: string; sha256: string }
  | { requestId: string; error: string };

type IdleWindow = Window & typeof globalThis & {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
};

function fileCacheKey(albumId: string, fileKey: string) {
  return `${albumId}:${fileKey}`;
}

function createState(status: DraftDuplicateState["status"], duplicateCount = 0): DraftDuplicateState {
  return { status, duplicateCount };
}

async function hashFileOnMainThread(file: File) {
  const buffer = await file.arrayBuffer();
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return bytesToHex(digest);
  }
  return sha256Hex(buffer);
}

function hashFileWithWorker(worker: Worker, requestId: string, file: File) {
  return new Promise<string>((resolve, reject) => {
    function cleanup() {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    }
    function onMessage(event: MessageEvent<HashWorkerMessage>) {
      if (event.data.requestId !== requestId) {
        return;
      }
      cleanup();
      if ("sha256" in event.data) {
        resolve(event.data.sha256);
        return;
      }
      reject(new Error(event.data.error));
    }
    function onError(event: ErrorEvent) {
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    }
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ requestId, file });
  });
}

function scheduleDeferredRun(task: () => void) {
  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(task, { timeout: 700 });
    return () => {
      idleWindow.cancelIdleCallback?.(handle);
    };
  }
  const handle = window.setTimeout(task, IOS_DUPLICATE_CHECK_DELAY_MS);
  return () => {
    window.clearTimeout(handle);
  };
}

export function useDraftDuplicateCheck({ albumId, open, drafts }: UseDraftDuplicateCheckOptions) {
  const [itemStates, setItemStates] = useState<Record<string, DraftDuplicateState>>({});
  const [checking, setChecking] = useState(false);
  const hashCacheRef = useRef(new Map<string, string>());
  const resultCacheRef = useRef(new Map<string, DraftDuplicateState>());
  const runIdRef = useRef(0);
  const deferredDrafts = useDeferredValue(drafts);

  const targets = useMemo(() => collectDraftDuplicateTargets(deferredDrafts), [deferredDrafts]);
  const targetSignature = useMemo(() => buildDuplicateTargetSignature(targets), [targets]);
  const targetByItemId = useMemo(() => new Map(targets.map((target) => [target.itemId, target])), [targets]);
  const shouldDelayLargeIosCheck = targets.length > LARGE_IOS_DUPLICATE_DELAY_THRESHOLD && isIosWebKit();

  useEffect(() => {
    if (!open) {
      runIdRef.current += 1;
      resultCacheRef.current.clear();
      setItemStates({});
      setChecking(false);
      return;
    }
    if (targets.length === 0) {
      setItemStates({});
      setChecking(false);
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const abortController = new AbortController();
    let worker: Worker | null = null;
    let disposed = false;
    let cancelScheduledRun: (() => void) | null = null;

    async function run() {
      const nextStates: Record<string, DraftDuplicateState> = {};
      const uncachedTargets = [];
      for (const target of targets) {
        const cached = resultCacheRef.current.get(fileCacheKey(albumId, target.fileKey));
        if (cached) {
          nextStates[target.itemId] = cached;
          continue;
        }
        nextStates[target.itemId] = createState("probing");
        uncachedTargets.push(target);
      }
      if (disposed || runId !== runIdRef.current) {
        return;
      }
      startTransition(() => {
        setItemStates(nextStates);
        setChecking(uncachedTargets.length > 0);
      });
      if (uncachedTargets.length === 0) {
        return;
      }

      const needsHashByItemId = new Map<string, boolean>();
      for (const batch of chunkItems(uncachedTargets, PROBE_BATCH_SIZE)) {
        const response = await probeDuplicateMedia(
          albumId,
          {
            items: batch.map((target) => ({
              clientId: target.itemId,
              byteSize: target.file.size
            }))
          },
          abortController.signal
        );
        for (const item of response.items) {
          needsHashByItemId.set(item.clientId, item.needsHash);
        }
        if (disposed || runId !== runIdRef.current) {
          return;
        }
      }

      const pendingHashTargets = [];
      const afterProbeStates = { ...nextStates };
      for (const target of uncachedTargets) {
        if (needsHashByItemId.get(target.itemId)) {
          afterProbeStates[target.itemId] = createState("hashing");
          pendingHashTargets.push(target);
          continue;
        }
        const resolved = createState("unique");
        afterProbeStates[target.itemId] = resolved;
        resultCacheRef.current.set(fileCacheKey(albumId, target.fileKey), resolved);
      }
      if (disposed || runId !== runIdRef.current) {
        return;
      }
      startTransition(() => {
        setItemStates(afterProbeStates);
      });
      if (pendingHashTargets.length === 0) {
        return;
      }

      if (typeof Worker !== "undefined") {
        worker = new Worker(new URL("../model/hash.worker.ts", import.meta.url));
      }

      for (const batch of chunkItems(pendingHashTargets, RESOLVE_BATCH_SIZE)) {
        const resolveItems = [];
        for (const target of batch) {
          const hashedCacheKey = fileCacheKey(albumId, target.fileKey);
          let sha256 = hashCacheRef.current.get(hashedCacheKey);
          if (!sha256) {
            sha256 = worker
              ? await hashFileWithWorker(worker, `${runId}:${target.itemId}`, target.file)
              : await hashFileOnMainThread(target.file);
            hashCacheRef.current.set(hashedCacheKey, sha256);
          }
          resolveItems.push({ clientId: target.itemId, sha256 });
          if (disposed || runId !== runIdRef.current) {
            return;
          }
        }

        const response = await resolveDuplicateMedia(albumId, { items: resolveItems }, abortController.signal);
        if (disposed || runId !== runIdRef.current) {
          return;
        }
        startTransition(() => {
          setItemStates((current) => {
            const next = { ...current };
            for (const item of response.items) {
              const resolved = createState(item.duplicate ? "duplicate" : "unique", item.duplicateCount);
              next[item.clientId] = resolved;
              const target = targetByItemId.get(item.clientId);
              if (target) {
                resultCacheRef.current.set(fileCacheKey(albumId, target.fileKey), resolved);
              }
            }
            return next;
          });
        });
      }
    }

    const executeRun = () => {
      void run().catch((error) => {
        if (abortController.signal.aborted || disposed || runId !== runIdRef.current) {
          return;
        }
        console.error("draft duplicate check failed", error);
        setItemStates((current) => {
          const next = { ...current };
          for (const target of targets) {
            if (!next[target.itemId] || next[target.itemId].status === "probing" || next[target.itemId].status === "hashing") {
              next[target.itemId] = createState("error");
            }
          }
          return next;
        });
      }).finally(() => {
        if (!disposed && runId === runIdRef.current) {
          startTransition(() => {
            setChecking(false);
          });
        }
        worker?.terminate();
      });
    };

    if (shouldDelayLargeIosCheck) {
      cancelScheduledRun = scheduleDeferredRun(() => {
        cancelScheduledRun = null;
        executeRun();
      });
    } else {
      executeRun();
    }

    return () => {
      disposed = true;
      abortController.abort();
      cancelScheduledRun?.();
      worker?.terminate();
    };
  }, [albumId, open, shouldDelayLargeIosCheck, targetSignature]);

  return {
    checking,
    itemStates
  };
}

export type DraftDuplicateCheckState = ReturnType<typeof useDraftDuplicateCheck>;
