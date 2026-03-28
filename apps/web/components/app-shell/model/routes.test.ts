import { describe, expect, it } from "vitest";
import { buildAlbumPath, buildAlbumsPath, buildAuthPath, parseSettingsScreen, resolveAlbumRedirect, resolveAlbumsRedirect, resolveAuthRedirect, resolveHomeRedirect } from "./routes";

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

  it("only accepts routable settings screens", () => {
    expect(parseSettingsScreen("storage")).toBe("storage");
    expect(parseSettingsScreen("babyDetail")).toBe("babyDetail");
    expect(parseSettingsScreen("memberDetail")).toBe("memberDetail");
    expect(parseSettingsScreen(null)).toBeNull();
  });

  it("resolves public route redirects from shared session state", () => {
    expect(resolveHomeRedirect({
      hydrated: true,
      authToken: "",
      inviteCode: "ABCD1234"
    })).toBe("/auth?invite=ABCD1234");

    expect(resolveAuthRedirect({
      hydrated: true,
      authToken: "token",
      activeAlbumId: "album-1"
    })).toBe("/album/album-1/photos");

    expect(resolveAlbumsRedirect({
      hydrated: true,
      authToken: "token",
      rememberedAlbumId: "album-2"
    })).toBe("/album/album-2/photos");
  });

  it("resolves protected album redirects consistently", () => {
    expect(resolveAlbumRedirect({
      bootPhaseDone: true,
      authToken: "",
      inviteCode: "ABCD1234",
      activeTab: "settings",
      requestedAlbumId: "album-1",
      loading: false,
      albumRefreshing: false
    })).toBe("/auth?invite=ABCD1234");

    expect(resolveAlbumRedirect({
      bootPhaseDone: true,
      authToken: "token",
      activeTab: "photos",
      requestedAlbumId: "album-1",
      activeAlbumId: "album-2",
      loading: false,
      albumRefreshing: false
    })).toBe("/album/album-2/photos");

    expect(resolveAlbumRedirect({
      bootPhaseDone: true,
      authToken: "token",
      activeTab: "photos",
      requestedAlbumId: "album-1",
      loading: false,
      albumRefreshing: false
    })).toBe("/albums");
  });
});
