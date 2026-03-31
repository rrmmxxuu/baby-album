import type { AlbumMember, Role, TimelineEntry } from "../../../lib/types";
import { formatBabyAge } from "./format";
import type { LightboxState, TimelineDayGroup } from "./types";

export function buildRelationLabels(members: AlbumMember[]) {
  const labels: Record<string, string> = {};
  for (const member of members) {
    const relation = member.relation?.trim();
    if (relation) {
      labels[member.userId] = relation;
    }
  }
  return labels;
}

export function buildTimelineFeed(items: TimelineEntry[], birthDate?: string, relationLabels?: Record<string, string>) {
  const days = new Map<string, TimelineDayGroup["batches"]>();
  for (const entry of items) {
    if (!entry.items || entry.items.length === 0) {
      continue;
    }
    const day = days.get(entry.timelineDay) ?? [];
    day.push({
      batchId: entry.id,
      uploadedBy: entry.uploadedBy,
      uploadedAt: entry.uploadedAt,
      uploadedByName: relationLabels?.[entry.uploadedBy] ?? "家人",
      caption: entry.caption,
      visibility: entry.visibility,
      timeMode: entry.timeMode,
      displayAt: entry.displayAt,
      timelineDay: entry.timelineDay,
      entry,
      items: [...entry.items].sort((left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime())
    });
    days.set(entry.timelineDay, day);
  }

  return Array.from(days.entries())
    .sort((left, right) => new Date(right[0]).getTime() - new Date(left[0]).getTime())
    .map(([day, batches]) => ({
      day,
      babyAgeLabel: birthDate ? formatBabyAge(birthDate, day) : "",
      itemsCount: batches.reduce((sum, batch) => sum + batch.items.length, 0),
      batches: batches.sort((left, right) => new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime())
    } satisfies TimelineDayGroup));
}

export function mergeTimelineEntries(existing: TimelineEntry[], incoming: TimelineEntry[]) {
  const seen = new Set(existing.map((entry) => entry.id));
  const next = [...existing];
  for (const entry of incoming) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    next.push(entry);
  }
  return next;
}

export function canEditTimelineEntry(role: Role, currentUserId: string | undefined, uploadedBy: string) {
  if (role === "owner" || role === "admin") {
    return true;
  }
  return Boolean(currentUserId) && currentUserId === uploadedBy;
}

export function moveLightbox(current: LightboxState, direction: -1 | 1) {
  const nextIndex = Math.min(Math.max(current.index + direction, 0), current.batch.items.length - 1);
  return { ...current, index: nextIndex };
}
