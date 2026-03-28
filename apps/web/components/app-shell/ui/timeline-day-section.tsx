import type { AlbumWorkspace } from "../../../lib/types";
import type { TimelineState } from "../hooks/use-timeline-state";
import { formatTimelineDate } from "../model/format";
import type { TimelineDayGroup } from "../model/types";
import { canEditTimelineEntry } from "../model/timeline";
import { MomentCard } from "./moment-card";

interface TimelineDaySectionProps {
  activeAlbum: AlbumWorkspace;
  authToken: string;
  day: TimelineDayGroup;
  timeline: TimelineState;
  currentUserId?: string;
}

export function TimelineDaySection({ activeAlbum, authToken, day, timeline, currentUserId }: TimelineDaySectionProps) {
  return (
    <article className="momentDay">
      <header className="momentDayHeader">
        <div>
          <h3>{formatTimelineDate(day.day)}</h3>
          <p>{day.itemsCount} 项</p>
        </div>
        {day.babyAgeLabel ? <span className="momentBabyDay">宝宝第 {day.babyAgeLabel}</span> : null}
      </header>
      <div className="momentBatchList">
        {day.batches.map((batch) => (
          <MomentCard
            albumId={activeAlbum.album.id}
            authToken={authToken}
            batch={batch}
            canEdit={canEditTimelineEntry(activeAlbum.membership.role, currentUserId, batch.uploadedBy)}
            commentComposerOpen={timeline.commentComposerEntryId === batch.entry.id}
            commentDraft={timeline.commentDrafts[batch.entry.id] ?? ""}
            commentSubmitting={timeline.commentSubmittingEntryId === batch.entry.id}
            key={`${day.day}-${batch.batchId}`}
            onCommentDraftChange={(value) => timeline.setCommentDraft(batch.entry.id, value)}
            onCommentSubmit={() => void timeline.handleCreateComment(batch.entry.id)}
            onCommentToggle={() => timeline.toggleCommentComposer(batch.entry.id)}
            onEdit={() => timeline.openEditEntry(batch.batchId)}
            onOpen={(index) => timeline.openLightbox({ albumId: activeAlbum.album.id, batch, index })}
          />
        ))}
      </div>
    </article>
  );
}
