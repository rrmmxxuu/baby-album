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
  previewBlobKey?: string;
  processedAt?: string;
}

export type TimelineVisibility = "members" | "managers";
export type TimelineTimeMode = "captured_at" | "uploaded_at" | "manual";

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
