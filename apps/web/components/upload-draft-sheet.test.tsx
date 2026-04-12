import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadDraftSheet } from "./upload-draft-sheet";
import type { BackgroundUploadController } from "./upload-draft-sheet/hooks/use-background-upload";

function buildBackgroundUpload(): BackgroundUploadController {
  return {
    clear: vi.fn(),
    hasTask: false,
    minimize: vi.fn(),
    openDialog: vi.fn(),
    startUpload: vi.fn(() => false),
    state: {
      phase: "idle",
      surface: "dialog",
      progress: null,
      errorMessage: "",
      albumId: ""
    }
  };
}

describe("UploadDraftSheet", () => {
  let inputClickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
      revokeObjectURL: vi.fn()
    });
    inputClickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the iOS picker guidance once per draft session before opening the file picker", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1");

    render(
      <UploadDraftSheet
        albumId="album-1"
        backgroundUpload={buildBackgroundUpload()}
        open
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "选择照片或视频" }));
    expect(screen.getByText("建议每次先选 20 到 30 张，回到草稿页后再点右上角继续追加，整体会更稳定。")).toBeVisible();
    expect(inputClickSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "继续选择" }));
    expect(inputClickSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "选择照片或视频" }));
    expect(inputClickSpy).toHaveBeenCalledTimes(2);
  });

  it("shows the append action after files are selected and wires it to the append picker", async () => {
    const { container } = render(
      <UploadDraftSheet
        albumId="album-1"
        backgroundUpload={buildBackgroundUpload()}
        open
        onClose={() => {}}
      />
    );

    const [replaceInput] = Array.from(container.querySelectorAll('input[type="file"]'));
    expect(replaceInput).toBeTruthy();

    fireEvent.change(replaceInput as HTMLInputElement, {
      target: {
        files: [new File(["photo"], "first.jpg", { type: "image/jpeg", lastModified: new Date("2026-04-03T08:00:00.000Z").getTime() })]
      }
    });

    expect(await screen.findByRole("button", { name: "追加" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
  });
});
