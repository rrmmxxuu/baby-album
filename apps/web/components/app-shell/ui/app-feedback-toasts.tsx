"use client";

import { useEffect, useMemo } from "react";

interface AppFeedbackToastsProps {
  notice: string | null;
  error: string | null;
  offsetForBottomNav?: boolean;
  onClearNotice: () => void;
  onClearError: () => void;
}

interface FeedbackToastItem {
  id: "notice" | "error";
  title: string;
  message: string;
  tone: "notice" | "error";
}

function buildToastTitle(tone: FeedbackToastItem["tone"], message: string) {
  if (tone === "error") {
    if (message.includes("unauthorized")) {
      return "登录状态已失效";
    }
    return "操作失败";
  }
  if (message.includes("欢迎回来")) {
    return "登录成功";
  }
  if (message.includes("欢迎，")) {
    return "注册成功";
  }
  if (message.includes("已退出")) {
    return "已退出登录";
  }
  if (message.includes("已创建")) {
    return "创建成功";
  }
  return "提示";
}

export function AppFeedbackToasts({ notice, error, offsetForBottomNav, onClearNotice, onClearError }: AppFeedbackToastsProps) {
  const items = useMemo<FeedbackToastItem[]>(() => {
    const next: FeedbackToastItem[] = [];
    if (error) {
      next.push({
        id: "error",
        title: buildToastTitle("error", error),
        message: error,
        tone: "error"
      });
    }
    if (notice) {
      next.push({
        id: "notice",
        title: buildToastTitle("notice", notice),
        message: notice,
        tone: "notice"
      });
    }
    return next;
  }, [error, notice]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => {
      onClearNotice();
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [notice, onClearNotice]);

  useEffect(() => {
    if (!error) {
      return;
    }
    const timer = window.setTimeout(() => {
      onClearError();
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [error, onClearError]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={`feedbackStack${offsetForBottomNav ? " feedbackStackOffset" : ""}`} aria-live="polite" aria-relevant="additions text">
      {items.map((item) => (
        <section className={`feedbackToast feedbackToast${item.tone === "error" ? "Error" : "Notice"}`} key={item.id} role={item.tone === "error" ? "alert" : "status"}>
          <div className="feedbackToastBody">
            <p className="feedbackToastTitle">{item.title}</p>
            <p className="feedbackToastMessage">{item.message || (item.tone === "error" ? "请稍后重试。" : "操作已完成。")}</p>
          </div>
          <button className="feedbackToastClose" onClick={item.tone === "error" ? onClearError : onClearNotice} type="button">
            关闭
          </button>
        </section>
      ))}
    </div>
  );
}
