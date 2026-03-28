import type { AlbumInvite, AlbumMember, Role } from "../../../lib/types";

export function memberRelationLabel(member?: Pick<AlbumMember, "relation"> | null) {
  const relation = member?.relation?.trim();
  return relation || "未设置关系";
}

export function roleLabel(role: Role) {
  switch (role) {
    case "owner":
      return "所有者";
    case "admin":
      return "管理员";
    case "member":
      return "成员";
    default:
      return "仅查看";
  }
}

export function inviteStatusLabel(status: AlbumInvite["status"]) {
  switch (status) {
    case "accepted":
      return "已接受";
    case "revoked":
      return "已撤销";
    default:
      return "待接受";
  }
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { dateStyle: "medium" });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function babyAvatarText(name?: string | null) {
  if (!name) {
    return "宝";
  }
  return name.slice(0, 1);
}

export function formatTimelineDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const now = new Date();
  return date.toLocaleDateString("zh-CN", {
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  });
}

export function formatBabyAge(birthDate: string, targetDate = new Date().toISOString()) {
  const start = startOfDay(new Date(birthDate));
  const end = startOfDay(new Date(targetDate));
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "1天";
  }
  const totalDays = Math.floor(diffMs / 86400000) + 1;
  if (totalDays < 30) {
    return `${totalDays}天`;
  }
  if (totalDays < 365) {
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    return days > 0 ? `${months}个月${days}天` : `${months}个月`;
  }
  const years = Math.floor(totalDays / 365);
  const remainingDays = totalDays % 365;
  const months = Math.floor(remainingDays / 30);
  return months > 0 ? `${years}岁${months}个月` : `${years}岁`;
}

export function formatRelativeUploadTime(value: string) {
  const time = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - time.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 60) {
    return `${Math.max(diffMinutes, 1)}分钟前`;
  }
  if (isSameDay(time, now)) {
    return `${Math.floor(diffMinutes / 60)}小时前`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(time, yesterday)) {
    return `昨天 ${time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }
  return `${time.toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" })} ${time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export function toDateInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
