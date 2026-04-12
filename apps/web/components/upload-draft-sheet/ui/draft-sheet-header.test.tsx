import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftSheetHeader } from "./draft-sheet-header";

describe("DraftSheetHeader", () => {
  it("shows the append action in list mode and wires it to the handler", () => {
    const onAppendFiles = vi.fn();

    render(
      <DraftSheetHeader
        babyName="Milo"
        currentScene="list"
        isEditMode={false}
        onAppendFiles={onAppendFiles}
        onBackToList={() => {}}
        onClose={() => {}}
        onSaveOrDone={() => {}}
        showAppendAction
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAppendFiles).toHaveBeenCalledTimes(1);
  });
});
