"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createTimelineComment } from "../../../../lib/api";
import type { AlbumWorkspace, TimelineEntry } from "../../../../lib/types";
import { errorMessageFromUnknown } from "../../model/feedback";

interface UseTimelineCommentsOptions {
  activeAlbum: AlbumWorkspace | null;
  setTimelineEntries: Dispatch<SetStateAction<TimelineEntry[]>>;
  clearFeedback: () => void;
  showWarning: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}

export function useTimelineComments({ activeAlbum, setTimelineEntries, clearFeedback, showWarning, showError }: UseTimelineCommentsOptions) {
  const [commentComposerEntryId, setCommentComposerEntryId] = useState("");
  const [commentSubmittingEntryId, setCommentSubmittingEntryId] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setCommentComposerEntryId("");
    setCommentSubmittingEntryId("");
    setCommentDrafts({});
  }, [activeAlbum?.album.id]);

  function toggleCommentComposer(entryId: string) {
    setCommentComposerEntryId((current) => current === entryId ? "" : entryId);
  }

  function setCommentDraft(entryId: string, value: string) {
    setCommentDrafts((current) => ({ ...current, [entryId]: value }));
  }

  async function handleCreateComment(entryId: string) {
    if (!activeAlbum) {
      return;
    }
    const content = (commentDrafts[entryId] ?? "").trim();
    if (!content) {
      showWarning("请补充内容", "请输入评论内容。");
      return;
    }
    clearFeedback();
    setCommentSubmittingEntryId(entryId);
    try {
      const comment = await createTimelineComment(entryId, {
        albumId: activeAlbum.album.id,
        content
      });
      setTimelineEntries((current) => current.map((entry) => entry.id === entryId ? { ...entry, comments: [...entry.comments, comment] } : entry));
      setCommentDrafts((current) => ({ ...current, [entryId]: "" }));
      setCommentComposerEntryId("");
    } catch (error) {
      showError("评论失败", errorMessageFromUnknown(error, "发表评论失败。"));
    } finally {
      setCommentSubmittingEntryId("");
    }
  }

  return {
    commentComposerEntryId,
    commentSubmittingEntryId,
    commentDrafts,
    setCommentDraft,
    toggleCommentComposer,
    handleCreateComment
  };
}
