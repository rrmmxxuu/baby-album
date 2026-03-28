import { describe, expect, it, vi, afterEach } from "vitest";
import { babyAvatarText, formatBabyAge, formatRelativeUploadTime, memberRelationLabel, roleLabel } from "./format";

describe("app-shell format helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats avatar fallback text", () => {
    expect(babyAvatarText("小宝")).toBe("小");
    expect(babyAvatarText("")).toBe("宝");
  });

  it("formats relation and role labels", () => {
    expect(memberRelationLabel({ relation: "妈妈" })).toBe("妈妈");
    expect(memberRelationLabel({ relation: "" })).toBe("未设置关系");
    expect(roleLabel("admin")).toBe("管理员");
  });

  it("formats baby age across days and months", () => {
    expect(formatBabyAge("2026-03-01T00:00:00.000Z", "2026-03-01T12:00:00.000Z")).toBe("1天");
    expect(formatBabyAge("2026-01-01T00:00:00.000Z", "2026-02-15T00:00:00.000Z")).toBe("1个月16天");
  });

  it("formats relative upload time against the current clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T12:00:00.000Z"));

    expect(formatRelativeUploadTime("2026-03-27T11:50:00.000Z")).toBe("10分钟前");
    expect(formatRelativeUploadTime("2026-03-27T08:00:00.000Z")).toBe("4小时前");
  });
});
