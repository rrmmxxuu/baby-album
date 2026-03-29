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

export function errorMessageFromUnknown(error: unknown, fallbackMessage: string, options?: ErrorMessageOptions) {
  if (error instanceof Error) {
    if (options?.unauthorizedMessage && error.message.includes("unauthorized")) {
      return options.unauthorizedMessage;
    }
    if (error.message.trim()) {
      return error.message;
    }
  }
  return fallbackMessage;
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
