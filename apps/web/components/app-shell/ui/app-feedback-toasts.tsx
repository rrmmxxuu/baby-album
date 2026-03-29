"use client";

import { useEffect, useMemo } from "react";

interface AppFeedbackToastsProps {
  notice: string | null;
  error: string | null;
  hasSession?: boolean;
  offsetForBottomNav?: boolean;
  onClearNotice: () => void;
  onClearError: () => void;
}

interface FeedbackToastItem {
  id: "notice" | "error";
  title: string;
  message: string;
  tone: "notice" | "warning" | "error";
}

function classifyToastTone(source: FeedbackToastItem["id"], message: string): FeedbackToastItem["tone"] {
  if (source === "error" && message.includes("unauthorized")) {
    return "error";
  }
  if (/^(请先|请输入|当前不可|当前身份没有|一条记录最多|视频记录暂不支持|每条记录至少)/.test(message)) {
    return "warning";
  }
  return source === "error" ? "error" : "notice";
}

function buildToastTitle(tone: FeedbackToastItem["tone"], message: string) {
  if (tone === "error") {
    return "操作失败";
  }
  if (tone === "warning") {
    if (message.includes("没有上传权限")) {
      return "没有权限";
    }
    if (message.includes("请输入")) {
      return "请补充信息";
    }
    return "还差一步";
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

function buildToastItem(source: FeedbackToastItem["id"], message: string, hasSession: boolean): FeedbackToastItem {
  const tone = classifyToastTone(source, message);
  const trimmedMessage = message.trim();

  if (tone === "error" && trimmedMessage.includes("unauthorized")) {
    return hasSession
      ? {
          id: source,
          title: "登录状态已失效",
          message: "请重新登录后再试。",
          tone
        }
      : {
          id: source,
          title: "登录失败",
          message: "邮箱或密码不正确，或账号还不存在。",
          tone
        };
  }

  if (tone === "notice" && trimmedMessage.includes("已退出")) {
    return {
      id: source,
      title: "已退出登录",
      message: "下次访问需要重新登录。",
      tone
    };
  }

  return {
    id: source,
    title: buildToastTitle(tone, trimmedMessage),
    message: trimmedMessage,
    tone
  };
}

export function AppFeedbackToasts({ notice, error, hasSession, offsetForBottomNav, onClearNotice, onClearError }: AppFeedbackToastsProps) {
  const items = useMemo<FeedbackToastItem[]>(() => {
    const next: FeedbackToastItem[] = [];
    if (error) {
      next.push(buildToastItem("error", error, Boolean(hasSession)));
    }
    if (notice) {
      next.push(buildToastItem("notice", notice, Boolean(hasSession)));
    }
    return next;
  }, [error, hasSession, notice]);

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
        <section className={`feedbackToast feedbackToast${item.tone === "error" ? "Error" : item.tone === "warning" ? "Warning" : "Notice"}`} key={item.id} role={item.tone === "error" ? "alert" : "status"}>
          <div className="feedbackToastBody">
            <p className="feedbackToastTitle">{item.title}</p>
            <p className="feedbackToastMessage">{item.message || (item.tone === "error" ? "请稍后重试。" : item.tone === "warning" ? "请先处理当前限制。" : "操作已完成。")}</p>
          </div>
          <button className="feedbackToastClose" onClick={item.tone === "error" ? onClearError : onClearNotice} type="button">
            关闭
          </button>
        </section>
      ))}
    </div>
  );
}
