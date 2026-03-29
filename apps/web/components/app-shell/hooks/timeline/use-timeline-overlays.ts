"use client";

import { useEffect, useState } from "react";
import type { TimelineEntry } from "../../../../lib/types";
import { OVERLAY_EXIT_MS } from "../../model/constants";
import { moveLightbox } from "../../model/timeline";
import type { LightboxState } from "../../model/types";

interface UseTimelineOverlaysOptions {
  timelineEntries: TimelineEntry[];
}

export function useTimelineOverlays({ timelineEntries }: UseTimelineOverlaysOptions) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [lightboxClosing, setLightboxClosing] = useState(false);
  const [draftSheetOpen, setDraftSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);

  useEffect(() => {
    if (!lightbox && !draftSheetOpen) {
      return;
    }
    const scrollY = window.scrollY;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [draftSheetOpen, lightbox]);

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
    closeDraftSheet
  };
}
