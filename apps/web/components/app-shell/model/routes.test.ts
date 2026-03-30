import { describe, expect, it } from "vitest";
import { buildAlbumPath, buildAlbumsPath, buildAuthPath, buildPhotosPath, parseSettingsScreen, resolveAlbumRedirect, resolveAlbumsRedirect } from "./routes";

describe("route helpers", () => {
  it("builds auth and albums paths with optional invite codes", () => {
    expect(buildAuthPath()).toBe("/auth");
    expect(buildAuthPath("ABCD1234")).toBe("/auth?invite=ABCD1234");
    expect(buildAlbumsPath("ABCD1234")).toBe("/albums?invite=ABCD1234");
  });

  it("builds album tab paths and preserves settings screen when needed", () => {
    expect(buildAlbumPath("album-1", "photos")).toBe("/album/album-1/photos");
    expect(buildAlbumPath("album-1", "settings")).toBe("/album/album-1/settings");
    expect(buildAlbumPath("album-1", "settings", { screen: "storage" })).toBe("/album/album-1/settings?screen=storage");
    expect(buildAlbumPath("album-1", "settings", { screen: "memberDetail", memberId: "user-1" })).toBe("/album/album-1/settings?screen=memberDetail&memberId=user-1");
  });

  it("builds photos paths for lightbox and composer states", () => {
    expect(buildPhotosPath("album-1")).toBe("/album/album-1/photos");
    expect(buildPhotosPath("album-1", { lightboxEntryId: "entry-1", mediaId: "media-2" })).toBe("/album/album-1/photos?lightbox=entry-1&media=media-2");
    expect(buildPhotosPath("album-1", { composer: "new" })).toBe("/album/album-1/photos?composer=new");
    expect(buildPhotosPath("album-1", { editEntryId: "entry-9" })).toBe("/album/album-1/photos?edit=entry-9");
  });

  it("only accepts routable settings screens", () => {
    expect(parseSettingsScreen("storage")).toBe("storage");
    expect(parseSettingsScreen("babyDetail")).toBe("babyDetail");
    expect(parseSettingsScreen("memberDetail")).toBe("memberDetail");
    expect(parseSettingsScreen(null)).toBeNull();
  });

  it("redirects the albums screen into the active album when available", () => {
    expect(resolveAlbumsRedirect({
      hydrated: true,
      activeAlbumId: "album-2"
    })).toBe("/album/album-2/photos");
  });

  it("resolves protected album redirects consistently", () => {
    expect(resolveAlbumRedirect({
      bootPhaseDone: true,
      inviteCode: "ABCD1234",
      activeTab: "settings",
      requestedAlbumId: "album-1",
      loading: false,
      albumRefreshing: false
    })).toBe("/albums?invite=ABCD1234");

    expect(resolveAlbumRedirect({
      bootPhaseDone: true,
      activeTab: "photos",
      requestedAlbumId: "album-1",
      activeAlbumId: "album-2",
      loading: false,
      albumRefreshing: false
    })).toBe("/album/album-2/photos");

    expect(resolveAlbumRedirect({
      bootPhaseDone: true,
      activeTab: "photos",
      requestedAlbumId: "album-1",
      loading: false,
      albumRefreshing: false
    })).toBe("/albums");
  });
});
