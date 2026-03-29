export type AppFeedbackTone = "success" | "warning" | "error";

export interface AppFeedback {
  id: number;
  tone: AppFeedbackTone;
  title: string;
  message: string;
  durationMs?: number;
}

interface BuildFeedbackOptions {
  durationMs?: number;
}

export function buildFeedback(id: number, tone: AppFeedbackTone, title: string, message: string, options?: BuildFeedbackOptions): AppFeedback {
  return {
    id,
    tone,
    title,
    message,
    durationMs: options?.durationMs
  };
}

interface ErrorMessageOptions {
  unauthorizedMessage?: string;
}

function requestIdFromUnknown(error: unknown) {
  if (!error || typeof error !== "object" || !("requestId" in error)) {
    return "";
  }
  const requestId = (error as { requestId?: unknown }).requestId;
  return typeof requestId === "string" ? requestId.trim() : "";
}

export function errorMessageFromUnknown(error: unknown, fallbackMessage: string, options?: ErrorMessageOptions) {
  let message = fallbackMessage;
  if (error instanceof Error) {
    if (options?.unauthorizedMessage && error.message.includes("unauthorized")) {
      message = options.unauthorizedMessage;
    } else if (error.message.trim()) {
      message = error.message;
    }
  }
  const requestId = requestIdFromUnknown(error);
  return requestId ? `${message}（请求 ID: ${requestId}）` : message;
}

export function feedbackDurationMs(tone: AppFeedbackTone) {
  if (tone === "error") {
    return 5200;
  }
  if (tone === "warning") {
    return 4200;
  }
  return 3600;
}
