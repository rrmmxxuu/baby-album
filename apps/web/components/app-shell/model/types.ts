import type { MediaAsset, TimelineEntry } from "../../../lib/types";

export type TabKey = "photos" | "feeding" | "settings";
export type AuthMode = "login" | "register";
export type SettingsScreen = "menu" | "account" | "babies" | "addBaby" | "babyDetail" | "memberDetail" | "storage";
export type NavDirection = "forward" | "back";
export type StorageStatus = "online" | "offline" | "pairing" | "unpaired";

export type TimelineBatch = {
  batchId: string;
  uploadedBy: string;
  uploadedAt: string;
  uploadedByName: string;
  caption: string;
  visibility: TimelineEntry["visibility"];
  timeMode: TimelineEntry["timeMode"];
  displayAt: string;
  timelineDay: string;
  entry: TimelineEntry;
  items: MediaAsset[];
};

export type TimelineDayGroup = {
  day: string;
  babyAgeLabel: string;
  itemsCount: number;
  batches: TimelineBatch[];
};

export type LightboxState = {
  albumId: string;
  batch: TimelineBatch;
  index: number;
};
