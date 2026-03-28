"use client";

import { useEffect, useRef } from "react";

interface MomentCommentComposerProps {
  open: boolean;
  commentDraft: string;
  commentSubmitting: boolean;
  onCommentDraftChange: (value: string) => void;
  onCommentSubmit: () => void;
  onCommentToggle: () => void;
}

export function MomentCommentComposer({ open, commentDraft, commentSubmitting, onCommentDraftChange, onCommentSubmit, onCommentToggle }: MomentCommentComposerProps) {
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(() => {
      commentInputRef.current?.focus();
      commentInputRef.current?.setSelectionRange(commentDraft.length, commentDraft.length);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, commentDraft.length]);

  if (!open) {
    return null;
  }

  return (
    <form className="momentCommentComposer" onSubmit={(event) => {
      event.preventDefault();
      onCommentSubmit();
    }}>
      <textarea autoFocus onChange={(event) => onCommentDraftChange(event.target.value)} placeholder="写下评论..." ref={commentInputRef} value={commentDraft} />
      <div className="momentCommentComposerActions">
        <button className="momentCommentActionButton" onClick={onCommentToggle} type="button">取消</button>
        <button className="momentCommentActionButton momentCommentActionButtonPrimary" disabled={commentSubmitting} type="submit">{commentSubmitting ? "发送中..." : "发送"}</button>
      </div>
    </form>
  );
}
