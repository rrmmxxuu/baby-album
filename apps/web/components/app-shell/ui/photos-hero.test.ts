import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AlbumSummary, AlbumWorkspace, BabyProfile } from "../../../lib/types";
import { PhotosHero } from "./photos-hero";

const activeBaby: BabyProfile = {
  id: "baby-1",
  albumId: "album-1",
  name: "Mia",
  birthDate: "2024-05-01",
  createdAt: "2024-05-01T00:00:00Z"
};

const activeAlbum: AlbumWorkspace = {
  album: {
    id: "album-1",
    name: "Mia Album",
    timezone: "Asia/Shanghai"
  },
  baby: activeBaby,
  currentUser: {
    id: "user-1",
    displayName: "Parent",
    email: "parent@example.com",
    createdAt: "2024-05-01T00:00:00Z"
  },
  membership: {
    userId: "user-1",
    albumId: "album-1",
    role: "owner",
    displayName: "Parent",
    relation: "妈妈"
  },
  timeline: [],
  members: [],
  babies: [activeBaby],
  invites: []
};

const albumOptions: AlbumSummary[] = [
  {
    album: activeAlbum.album,
    baby: activeBaby,
    membership: activeAlbum.membership
  }
];

describe("PhotosHero", () => {
  it("shows a skeleton pill instead of loading copy when the timeline is empty and loading", () => {
    const { container } = render(createElement(PhotosHero, {
      activeAlbum,
      activeBaby,
      albumOptions,
      onAlbumChange: vi.fn(),
      timelineCount: 0,
      timelineLoading: true
    }));

    expect(screen.queryByText("正在加载")).not.toBeInTheDocument();
    expect(container.querySelector(".loadingSkeletonPill")).not.toBeNull();
    expect(screen.getByRole("combobox")).toHaveValue("baby-1");
  });

  it("shows the timeline count once loading finishes", () => {
    render(createElement(PhotosHero, {
      activeAlbum,
      activeBaby,
      albumOptions,
      onAlbumChange: vi.fn(),
      timelineCount: 3,
      timelineLoading: false
    }));

    expect(screen.getByText("3 条内容")).toBeVisible();
    expect(document.querySelector(".loadingSkeletonPill")).toBeNull();
  });
});
