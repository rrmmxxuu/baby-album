"use client";

import { useEffect } from "react";
import { feedbackDurationMs, type AppFeedback } from "../model/feedback";

interface AppFeedbackToastsProps {
  feedback: AppFeedback | null;
  offsetForBottomNav?: boolean;
  onClearFeedback: () => void;
}

export function AppFeedbackToasts({ feedback, offsetForBottomNav, onClearFeedback }: AppFeedbackToastsProps) {
  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timer = window.setTimeout(() => {
      onClearFeedback();
    }, feedback.durationMs ?? feedbackDurationMs(feedback.tone));
    return () => window.clearTimeout(timer);
  }, [feedback, onClearFeedback]);

  if (!feedback) {
    return null;
  }

  return (
    <div className={`feedbackStack${offsetForBottomNav ? " feedbackStackOffset" : ""}`} aria-live="polite" aria-relevant="additions text">
      <section className={`feedbackToast feedbackToast${feedback.tone === "error" ? "Error" : feedback.tone === "warning" ? "Warning" : "Success"}`} key={feedback.id} role={feedback.tone === "error" ? "alert" : "status"}>
        <div className="feedbackToastBody">
          <p className="feedbackToastTitle">{feedback.title}</p>
          <p className="feedbackToastMessage">{feedback.message}</p>
        </div>
        <button className="feedbackToastClose" onClick={onClearFeedback} type="button">
          关闭
        </button>
      </section>
    </div>
  );
}
