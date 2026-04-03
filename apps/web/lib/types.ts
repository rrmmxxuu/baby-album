export type Role = "owner" | "admin" | "member" | "viewer";
export type InviteStatus = "pending" | "accepted" | "revoked";

export interface Album {
  id: string;
  name: string;
  timezone: string;
}

export interface AlbumMember {
  userId: string;
  albumId: string;
  role: Role;
  displayName: string;
  relation?: string;
}

export interface BabyProfile {
  id: string;
  albumId: string;
  name: string;
  birthDate?: string;
  hasAvatar?: boolean;
  avatarUpdatedAt?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface AlbumInvite {
  id: string;
  albumId: string;
  code: string;
  role: Role;
  status: InviteStatus;
  createdBy: string;
  createdByName?: string;
  albumName?: string;
  createdAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
}

export interface StorageNode {
  id: string;
  albumId: string;
  name: string;
  status: "online" | "offline";
  lastSeenAt: string;
  totalBytes: number;
  freeBytes: number;
  availableBytes: number;
}

export interface StorageNodePairing {
  code: string;
  albumId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

export interface MediaAsset {
  id: string;
  albumId: string;
  entryId: string;
  uploadBatchId: string;
  uploadedBy: string;
  uploadedByName: string;
  fileName: string;
  mediaType: string;
  capturedAt: string;
  uploadedAt: string;
  timelineDay: string;
  status: "ready" | "pending";
  source: string;
  width: number;
  height: number;
  previewStatus: "pending" | "ready" | "unavailable";
  previewUrl?: string;
  previewBlobKey?: string;
  screenPreviewStatus?: "pending" | "ready" | "unavailable";
  screenPreviewUrl?: string;
  originalUrl?: string;
  originalAvailability?: "hot" | "warm" | "cold" | "restoring" | "unavailable";
  processedAt?: string;
}

export type TimelineVisibility = "members" | "managers";
export type TimelineTimeMode = "captured_at" | "uploaded_at" | "manual";

export interface TimelineComment {
  id: string;
  albumId: string;
  entryId: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: string;
}

export interface TimelineEntry {
  id: string;
  albumId: string;
  caption: string;
  visibility: TimelineVisibility;
  timeMode: TimelineTimeMode;
  displayAt: string;
  timelineDay: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  createdAt: string;
  items: MediaAsset[];
  comments: TimelineComment[];
}

export type FeedingCategory = "milk" | "solid" | "diaper" | "sleep" | "supplement" | "medicine";
export type FeedingMilkMode = "breast" | "bottle" | "formula";
export type FeedingTimerSide = "left" | "right";
export type FeedingTimerStatus = "running" | "paused";

export interface FeedingEntryItem {
  id: string;
  entryId: string;
  name: string;
  dose?: string;
  sortOrder: number;
  createdAt: string;
}

export interface FeedingEntry {
  id: string;
  albumId: string;
  babyId: string;
  category: FeedingCategory;
  occurredAt: string;
  endedAt?: string;
  dayKey: string;
  note: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  milkMode?: FeedingMilkMode;
  amountMl?: number;
  breastLeftSeconds?: number;
  breastRightSeconds?: number;
  foodName?: string;
  hasStool?: boolean;
  items: FeedingEntryItem[];
}

export interface BreastFeedingTimerSession {
  id: string;
  albumId: string;
  babyId: string;
  dayKey: string;
  startedAt: string;
  status: FeedingTimerStatus;
  activeSide?: FeedingTimerSide;
  activeSegmentStartedAt?: string;
  leftElapsedSeconds: number;
  rightElapsedSeconds: number;
  version: number;
  updatedBy: string;
  updatedByName?: string;
  updatedAt: string;
  createdAt: string;
}

export interface FeedingCountSummary {
  count: number;
  itemCount?: number;
}

export interface FeedingMilkSummary {
  count: number;
  breastCount: number;
  bottleCount: number;
  formulaCount: number;
  totalMl: number;
  breastMinutes: number;
}

export interface FeedingDiaperSummary {
  count: number;
  stoolCount: number;
}

export interface FeedingSleepSummary {
  count: number;
  totalMinutes: number;
}

export interface FeedingSummary {
  milk: FeedingMilkSummary;
  diaper: FeedingDiaperSummary;
  solid: FeedingCountSummary;
  supplement: FeedingCountSummary;
  medicine: FeedingCountSummary;
  sleep: FeedingSleepSummary;
}

export interface FeedingDayPayload {
  day: string;
  summary: FeedingSummary;
  entries: FeedingEntry[];
  activeBreastTimer?: BreastFeedingTimerSession | null;
}

export interface FeedingEntryItemInput {
  name: string;
  dose?: string;
}

export interface FeedingEntryUpsertInput {
  category: FeedingCategory;
  occurredAt: string;
  endedAt?: string;
  note: string;
  milkMode?: FeedingMilkMode;
  amountMl?: number;
  breastLeftSeconds?: number;
  breastRightSeconds?: number;
  foodName?: string;
  hasStool?: boolean;
  items?: FeedingEntryItemInput[];
}

export interface FeedingTimerActionInput {
  action: "start" | "pause" | "switch" | "resume" | "cancel";
  side?: FeedingTimerSide;
  expectedVersion: number;
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  createdAt: string;
}

export interface AuthPayload {
  user: User;
  token: string;
  expiresAt: string;
}

export interface SessionAuthPayload {
  user: User;
  expiresAt: string;
}

export interface AlbumSummary {
  album: Album;
  baby?: BabyProfile | null;
  membership: AlbumMember;
}

export interface AlbumWorkspace {
  album: Album;
  baby?: BabyProfile | null;
  currentUser: User;
  membership: AlbumMember;
  storageNode?: StorageNode | null;
  timeline: TimelineEntry[];
  members: AlbumMember[];
  babies: BabyProfile[];
  invites: AlbumInvite[];
}

export interface AppStatePayload {
  currentUser: User;
  albums: AlbumSummary[];
  activeAlbumId?: string;
  activeAlbum?: AlbumWorkspace | null;
}

export interface TimelinePagePayload {
  items: TimelineEntry[];
  nextCursor?: string;
  hasMore: boolean;
}
