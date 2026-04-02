import { describe, expect, it } from "vitest";
import { resolvePhotosTabHref, resolveRouteChrome } from "./route-chrome";
import type { AppStatePayload } from "../../../lib/types";

function searchParams(query = "") {
  return new URLSearchParams(query);
}

describe("route chrome", () => {
  it("classifies settings detail and photos overlay routes", () => {
    expect(resolveRouteChrome("/settings", searchParams())).toEqual({ activeTab: "settings", bottomNavHidden: false });
    expect(resolveRouteChrome("/settings/account", searchParams())).toEqual({ activeTab: "settings", bottomNavHidden: true });
    expect(resolveRouteChrome("/babies/baby-1/manage/storage", searchParams())).toEqual({ activeTab: "settings", bottomNavHidden: true });
    expect(resolveRouteChrome("/babies/baby-1/photos", searchParams())).toEqual({ activeTab: "photos", bottomNavHidden: false });
    expect(resolveRouteChrome("/babies/baby-1/photos", searchParams("lightbox=entry-1"))).toEqual({ activeTab: "photos", bottomNavHidden: true });
  });

  it("resolves the photos tab href from the current photo route first", () => {
    expect(resolvePhotosTabHref("/babies/baby-9/photos", null, "baby-1")).toBe("/babies/baby-9/photos");
  });

  it("falls back to the last viewed or first joined baby when away from photos", () => {
    const appState = {
      currentUser: { id: "user-1", displayName: "家人", email: "family@example.com" },
      albums: [
        {
          album: { id: "album-1", title: "宝宝" },
          baby: { id: "baby-1", name: "宝宝一", birthDate: null, avatarUrl: null },
          membership: { userId: "user-1", role: "owner", relation: "爸爸", displayName: "家人", email: "family@example.com" }
        }
      ],
      activeAlbumId: "album-1"
    } as unknown as AppStatePayload;

    expect(resolvePhotosTabHref("/settings", appState, "baby-2")).toBe("/babies/baby-2/photos");
    expect(resolvePhotosTabHref("/settings", appState, "")).toBe("/babies/baby-1/photos");
  });
});
