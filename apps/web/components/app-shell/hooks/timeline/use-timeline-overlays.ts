"use client";

import type { RefObject } from "react";
import { useEffect, useState } from "react";
import type { MediaAsset, TimelineEntry } from "../../../../lib/types";
import { OVERLAY_EXIT_MS } from "../../model/constants";
import { moveLightbox } from "../../model/timeline";
import type { LightboxState } from "../../model/types";

interface UseTimelineOverlaysOptions {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  timelineEntries: TimelineEntry[];
}

export function useTimelineOverlays({ scrollContainerRef, timelineEntries }: UseTimelineOverlaysOptions) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [lightboxClosing, setLightboxClosing] = useState(false);
  const [draftSheetOpen, setDraftSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);

  useEffect(() => {
    if (!lightbox && !draftSheetOpen) {
      return;
    }
    const viewport = scrollContainerRef.current;
    if (!viewport) {
      return;
    }
    const scrollTop = viewport.scrollTop;
    const previousOverflow = viewport.style.overflow;
    const previousOverscrollBehavior = viewport.style.overscrollBehavior;
    viewport.style.overflow = "hidden";
    viewport.style.overscrollBehavior = "contain";
    return () => {
      viewport.style.overflow = previousOverflow;
      viewport.style.overscrollBehavior = previousOverscrollBehavior;
      viewport.scrollTop = scrollTop;
    };
  }, [draftSheetOpen, lightbox, scrollContainerRef]);

  useEffect(() => {
    if (!lightbox) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestCloseLightbox();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigateLightbox(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigateLightbox(1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  useEffect(() => {
    if (!lightboxClosing) {
      return;
    }
    const timer = window.setTimeout(() => {
      setLightbox(null);
      setLightboxClosing(false);
    }, OVERLAY_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [lightboxClosing]);

  useEffect(() => {
    if (draftSheetOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      setEditingEntry(null);
    }, OVERLAY_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [draftSheetOpen]);

  function openLightbox(next: LightboxState) {
    setLightboxClosing(false);
    setLightbox(next);
  }

  function navigateLightbox(direction: -1 | 1) {
    setLightbox((current) => current ? moveLightbox(current, direction) : current);
  }

  function requestCloseLightbox() {
    if (!lightbox || lightboxClosing) {
      return;
    }
    setLightboxClosing(true);
  }

  function openNewDraftSheet() {
    setEditingEntry(null);
    setDraftSheetOpen(true);
  }

  function openEditEntry(entryId: string) {
    const entry = timelineEntries.find((item) => item.id === entryId) ?? null;
    if (!entry) {
      return;
    }
    setEditingEntry(entry);
    setDraftSheetOpen(true);
  }

  function closeDraftSheet() {
    setDraftSheetOpen(false);
  }

  function patchMediaAsset(updatedMedia: MediaAsset) {
    setLightbox((current) => {
      if (!current || current.batch.entry.id !== updatedMedia.entryId) {
        return current;
      }
      const entryItems = current.batch.entry.items.map((item) => item.id === updatedMedia.id ? updatedMedia : item);
      return {
        ...current,
        batch: {
          ...current.batch,
          entry: {
            ...current.batch.entry,
            items: entryItems
          },
          items: current.batch.items.map((item) => item.id === updatedMedia.id ? updatedMedia : item)
        }
      };
    });
    setEditingEntry((current) => {
      if (!current || current.id !== updatedMedia.entryId) {
        return current;
      }
      return {
        ...current,
        items: current.items.map((item) => item.id === updatedMedia.id ? updatedMedia : item)
      };
    });
  }

  return {
    lightbox,
    lightboxClosing,
    openLightbox,
    navigateLightbox,
    requestCloseLightbox,
    draftSheetOpen,
    editingEntry,
    openNewDraftSheet,
    openEditEntry,
    closeDraftSheet,
    patchMediaAsset
  };
}
