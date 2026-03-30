"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AlbumWorkspace } from "../../../lib/types";
import type { TimelineState } from "../hooks/use-timeline-state";
import { formatTimelineDate } from "../model/format";
import type { TimelineDayGroup } from "../model/types";
import { canEditTimelineEntry } from "../model/timeline";
import { MomentCard } from "./moment-card";

interface TimelineDaySectionProps {
  activeAlbum: AlbumWorkspace;
  day: TimelineDayGroup;
  timeline: TimelineState;
  currentUserId?: string;
  onEditEntry: (entryId: string) => void;
  onOpenLightbox: (entryId: string, mediaId: string) => void;
  priority?: boolean;
}

export function TimelineDaySection({ activeAlbum, day, timeline, currentUserId, onEditEntry, onOpenLightbox, priority }: TimelineDaySectionProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [shouldRenderBatches, setShouldRenderBatches] = useState(Boolean(priority));
  const placeholderHeight = useMemo(() => Math.max(320, Math.min(2200, day.batches.length * 280)), [day.batches.length]);

  useEffect(() => {
    if (priority) {
      setShouldRenderBatches(true);
      return;
    }
    const target = containerRef.current;
    if (!target || shouldRenderBatches) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldRenderBatches(true);
        observer.disconnect();
      }
    }, { rootMargin: "1200px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [priority, shouldRenderBatches]);

  return (
    <article className={`momentDay${shouldRenderBatches ? " momentDayReady" : " momentDayDeferred"}`} ref={containerRef}>
      <header className="momentDayHeader">
        <div className="momentDayHeaderCopy">
          <h3>{formatTimelineDate(day.day)}</h3>
          {day.babyAgeLabel ? <span className="momentBabyDay">宝宝第 {day.babyAgeLabel}</span> : null}
        </div>
      </header>
      {shouldRenderBatches ? (
        <div className="momentBatchList">
          {day.batches.map((batch) => (
            <MomentCard
              albumId={activeAlbum.album.id}
              batch={batch}
              canEdit={canEditTimelineEntry(activeAlbum.membership.role, currentUserId, batch.uploadedBy)}
              commentComposerOpen={timeline.commentComposerEntryId === batch.entry.id}
              commentDraft={timeline.commentDrafts[batch.entry.id] ?? ""}
              commentSubmitting={timeline.commentSubmittingEntryId === batch.entry.id}
              key={`${day.day}-${batch.batchId}`}
              onCommentDraftChange={(value) => timeline.setCommentDraft(batch.entry.id, value)}
              onCommentSubmit={() => void timeline.handleCreateComment(batch.entry.id)}
              onCommentToggle={() => timeline.toggleCommentComposer(batch.entry.id)}
              onEdit={() => onEditEntry(batch.entry.id)}
              onOpen={(index) => onOpenLightbox(batch.entry.id, batch.items[index]?.id ?? batch.items[0].id)}
            />
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="momentDayPlaceholder" style={{ minHeight: `${placeholderHeight}px` }} />
      )}
    </article>
  );
}
