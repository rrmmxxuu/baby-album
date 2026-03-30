"use client";

import { formatRelativeUploadTime } from "../model/format";
import type { TimelineBatch } from "../model/types";
import { MomentCommentComposer } from "./moment-comment-composer";
import { MomentComments } from "./moment-comments";
import { MomentThumb } from "./moment-thumb";
import { MomentVideo } from "./moment-video";

interface MomentCardProps {
  albumId: string;
  batch: TimelineBatch;
  canEdit: boolean;
  commentComposerOpen: boolean;
  commentDraft: string;
  commentSubmitting: boolean;
  onCommentDraftChange: (value: string) => void;
  onCommentSubmit: () => void;
  onCommentToggle: () => void;
  onEdit: () => void;
  onOpen: (index: number) => void;
}

export function MomentCard({ albumId, batch, canEdit, commentComposerOpen, commentDraft, commentSubmitting, onCommentDraftChange, onCommentSubmit, onCommentToggle, onEdit, onOpen }: MomentCardProps) {
  const isVideoBatch = batch.items.length === 1 && batch.items[0].mediaType.startsWith("video/");

  return (
    <article className="momentCard">
      {isVideoBatch ? (
        <MomentVideo albumId={albumId} item={batch.items[0]} onOpen={() => onOpen(0)} />
      ) : (
        <div className={`momentPhotoGrid momentPhotoGrid${Math.min(batch.items.length, 9)}`}>
          {batch.items.map((item, index) => <MomentThumb albumId={albumId} item={item} key={item.id} onOpen={() => onOpen(index)} />)}
        </div>
      )}
      {batch.caption ? <p className="momentCaption">{batch.caption}</p> : null}
      <div className="momentCardFooter">
        <div className="momentMetaGroup">
          <p className="momentMeta">{batch.uploadedByName || "家人"} 上传于 {formatRelativeUploadTime(batch.uploadedAt)}</p>
          {batch.visibility === "managers" ? <p className="momentMeta">仅管理员和所有者可见</p> : null}
        </div>
        <div className="momentActionGroup">
          <button className={`momentCommentButton${commentComposerOpen ? " momentCommentButtonActive" : ""}`} onClick={onCommentToggle} type="button">评论</button>
          {canEdit ? <button className="momentEditButton" onClick={onEdit} type="button">编辑</button> : null}
        </div>
      </div>
      <MomentComments comments={batch.entry.comments} />
      <MomentCommentComposer commentDraft={commentDraft} commentSubmitting={commentSubmitting} onCommentDraftChange={onCommentDraftChange} onCommentSubmit={onCommentSubmit} onCommentToggle={onCommentToggle} open={commentComposerOpen} />
    </article>
  );
}
