import { describe, expect, it } from "vitest";
import {
  buildAuthPath,
  buildBabyFeedingPath,
  buildBabyManageMemberPath,
  buildBabyManagePath,
  buildBabyManageStoragePath,
  buildBabyPath,
  buildBabyPhotosPath,
  buildFeedingHubPath,
  buildPhotosHubPath,
  buildSettingsAccountPath,
  buildSettingsBabiesNewPath,
  buildSettingsBabiesPath,
  buildSettingsPath,
  buildWelcomePath
} from "./routes";

describe("route helpers", () => {
  it("builds auth paths with optional invite codes", () => {
    expect(buildAuthPath()).toBe("/auth");
    expect(buildAuthPath("ABCD1234")).toBe("/auth?invite=ABCD1234");
  });

  it("builds global hub routes", () => {
    expect(buildWelcomePath()).toBe("/welcome");
    expect(buildPhotosHubPath()).toBe("/photos");
    expect(buildFeedingHubPath()).toBe("/feeding");
    expect(buildSettingsPath()).toBe("/settings");
    expect(buildSettingsAccountPath()).toBe("/settings/account");
    expect(buildSettingsBabiesPath()).toBe("/settings/babies");
    expect(buildSettingsBabiesNewPath()).toBe("/settings/babies/new");
  });

  it("builds baby-scoped routes", () => {
    expect(buildBabyPath("baby-1")).toBe("/babies/baby-1");
    expect(buildBabyFeedingPath("baby-1")).toBe("/babies/baby-1/feeding");
    expect(buildBabyManagePath("baby-1")).toBe("/babies/baby-1/manage");
    expect(buildBabyManageStoragePath("baby-1")).toBe("/babies/baby-1/manage/storage");
    expect(buildBabyManageMemberPath("baby-1", "user-1")).toBe("/babies/baby-1/manage/members/user-1");
  });

  it("builds baby photo routes for lightbox and composer states", () => {
    expect(buildBabyPhotosPath("baby-1")).toBe("/babies/baby-1/photos");
    expect(buildBabyPhotosPath("baby-1", { lightboxEntryId: "entry-1", mediaId: "media-2" })).toBe("/babies/baby-1/photos?lightbox=entry-1&media=media-2");
    expect(buildBabyPhotosPath("baby-1", { composer: "new" })).toBe("/babies/baby-1/photos?composer=new");
    expect(buildBabyPhotosPath("baby-1", { editEntryId: "entry-9" })).toBe("/babies/baby-1/photos?edit=entry-9");
  });
});
