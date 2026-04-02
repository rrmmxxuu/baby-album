import { Fragment, createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AppLoadingSkeleton,
  FeedingContentLoadingSkeleton,
  FeedingRouteSkeleton,
  PhotosRouteSkeleton,
  PhotosTimelineLoadingSkeleton,
  SettingsDetailLoadingSkeleton
} from "./loading-skeletons";

describe("loading skeletons", () => {
  it("renders accessible status containers for route-level skeletons", () => {
    render(createElement(
      Fragment,
      null,
      createElement(AppLoadingSkeleton, { ariaLabel: "正在加载宝宝相册" }),
      createElement(PhotosRouteSkeleton, { ariaLabel: "正在进入宝宝时间线" }),
      createElement(FeedingRouteSkeleton, { ariaLabel: "正在进入喂养页" }),
      createElement(SettingsDetailLoadingSkeleton, { ariaLabel: "正在返回可访问页面" })
    ));

    expect(screen.getByRole("status", { name: "正在加载宝宝相册" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "正在进入宝宝时间线" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "正在进入喂养页" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "正在返回可访问页面" })).toHaveAttribute("aria-busy", "true");
  });

  it("renders standalone content skeletons without visible loading copy", () => {
    const { container } = render(createElement(
      Fragment,
      null,
      createElement(PhotosTimelineLoadingSkeleton, { ariaLabel: "正在加载时间线" }),
      createElement(FeedingContentLoadingSkeleton, { ariaLabel: "正在加载喂养记录" })
    ));

    expect(screen.getByRole("status", { name: "正在加载时间线" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "正在加载喂养记录" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("正在加载时间线")).not.toBeInTheDocument();
    expect(screen.queryByText("正在加载喂养记录")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".loadingSkeletonBlock").length).toBeGreaterThan(0);
  });
});
