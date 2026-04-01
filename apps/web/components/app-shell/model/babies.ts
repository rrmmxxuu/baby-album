import type { AlbumSummary, BabyProfile, Role } from "../../../lib/types";

export type JoinedBabySummary = AlbumSummary & { baby: BabyProfile };

export function joinedBabySummaries(items: AlbumSummary[]) {
  return items.filter((item): item is JoinedBabySummary => Boolean(item.baby));
}

export function findJoinedBaby(items: AlbumSummary[], babyId: string) {
  const targetId = babyId.trim();
  if (!targetId) {
    return null;
  }
  return joinedBabySummaries(items).find((item) => item.baby.id === targetId) ?? null;
}

export function canAccessFeeding(role: Role) {
  return role === "owner" || role === "admin" || role === "member";
}

export function feedingBabySummaries(items: AlbumSummary[]) {
  return joinedBabySummaries(items).filter((item) => canAccessFeeding(item.membership.role));
}
