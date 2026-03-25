export type Role = "owner" | "admin" | "member" | "viewer";
export type InviteStatus = "pending" | "accepted" | "revoked";

export interface Family {
  id: string;
  name: string;
  timezone: string;
}

export interface FamilyMember {
  userId: string;
  familyId: string;
  role: Role;
  displayName: string;
}

export interface BabyProfile {
  id: string;
  familyId: string;
  name: string;
  birthDate?: string;
  createdAt: string;
}

export interface FamilyInvite {
  id: string;
  familyId: string;
  code: string;
  role: Role;
  status: InviteStatus;
  createdBy: string;
  createdByName?: string;
  familyName?: string;
  createdAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
}

export interface StorageNode {
  id: string;
  familyId: string;
  name: string;
  status: "online" | "offline";
  lastSeenAt: string;
}

export interface MediaAsset {
  id: string;
  familyId: string;
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

export interface FamilySummary {
  family: Family;
  membership: FamilyMember;
}

export interface FamilyWorkspace {
  family: Family;
  currentUser: User;
  membership: FamilyMember;
  storageNode?: StorageNode | null;
  timeline: MediaAsset[];
  members: FamilyMember[];
  babies: BabyProfile[];
  invites: FamilyInvite[];
}

export interface AppStatePayload {
  currentUser: User;
  families: FamilySummary[];
  activeFamilyId?: string;
  activeFamily?: FamilyWorkspace | null;
}