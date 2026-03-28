import type { TimelineComment } from "../../../lib/types";
import { formatRelativeUploadTime } from "../model/format";

interface MomentCommentsProps {
  comments: TimelineComment[];
}

export function MomentComments({ comments }: MomentCommentsProps) {
  if (comments.length === 0) {
    return null;
  }

  return (
    <div className="momentComments">
      {comments.map((comment) => (
        <article className="momentCommentItem" key={comment.id}>
          <div className="momentCommentHeader">
            <strong>{comment.displayName}</strong>
            <span>{formatRelativeUploadTime(comment.createdAt)}</span>
          </div>
          <p>{comment.content}</p>
        </article>
      ))}
    </div>
  );
}
