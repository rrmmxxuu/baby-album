import type {
  FeedingCategory,
  FeedingDayPayload,
  FeedingEntry,
  FeedingEntryItem,
  FeedingMilkMode,
  FeedingSummary
} from "../../../lib/types";

export const FEEDING_COMPOSER_KINDS: FeedingCategory[] = ["milk", "solid", "diaper", "sleep", "supplement", "medicine"];
export const SUPPLEMENT_PRESETS = ["维生素D", "维生素A", "维生素AD", "铁", "钙", "锌", "DHA", "益生菌", "乳铁蛋白", "叶黄素", "复合维生素"] as const;
export const MEDICINE_PRESETS = ["美林", "泰诺林", "头孢", "蒙脱石散", "乳糖酶", "双歧杆菌", "妈咪爱", "美开朗", "托百士", "感冒颗粒"] as const;
export const FEEDING_DOSE_UNITS = ["片", "粒", "毫升", "克", "毫克", "袋", "勺", "滴", "支", "包"] as const;

export interface FeedingSummaryCard {
  key: string;
  label: string;
  value: string;
  detail: string;
}

function emptyFeedingSummary(): FeedingSummary {
  return {
    milk: { count: 0, breastCount: 0, bottleCount: 0, formulaCount: 0, totalMl: 0, breastMinutes: 0 },
    diaper: { count: 0, stoolCount: 0 },
    solid: { count: 0 },
    supplement: { count: 0, itemCount: 0 },
    medicine: { count: 0, itemCount: 0 },
    sleep: { count: 0, totalMinutes: 0 }
  };
}

function dateFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function dayParts(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map((value) => Number.parseInt(value, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return { year, month, day };
}

function formatDateKey(date: Date, timeZone: string) {
  const parts = dateFormatter(timeZone).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function formatEntryItems(items: FeedingEntryItem[]) {
  return items
    .map((item) => item.dose ? `${item.name} ${item.dose}` : item.name)
    .join("、");
}

function formatMilkMode(mode?: FeedingMilkMode) {
  switch (mode) {
    case "breast":
      return "亲喂";
    case "bottle":
      return "瓶喂";
    case "formula":
      return "配方奶";
    default:
      return "喂奶";
  }
}

function extractIsoDayKey(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

export function extractFeedingDayKey(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return extractIsoDayKey(value);
}

export function isFeedingComposerKind(value: string | null | undefined): value is FeedingCategory {
  return FEEDING_COMPOSER_KINDS.some((item) => item === value);
}

export function isFeedingDayKey(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function feedingTodayDayKey(timeZone: string, now = new Date()) {
  return formatDateKey(now, timeZone);
}

export function normalizeFeedingDayKey(dayKey: string | null | undefined, timeZone: string) {
  return isFeedingDayKey(dayKey) ? dayKey : feedingTodayDayKey(timeZone);
}

export function clampFeedingDayKey(dayKey: string, minDay: string, maxDay: string) {
  if (dayKey < minDay) {
    return minDay;
  }
  if (dayKey > maxDay) {
    return maxDay;
  }
  return dayKey;
}

export function shiftFeedingDayKey(dayKey: string, offset: number) {
  const parts = dayParts(dayKey);
  if (!parts) {
    return dayKey;
  }
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset));
  return shifted.toISOString().slice(0, 10);
}

export function buildFeedingDayStrip(minDay: string, maxDay: string) {
  if (!isFeedingDayKey(minDay) || !isFeedingDayKey(maxDay) || minDay > maxDay) {
    return [];
  }
  const items: string[] = [];
  for (let current = minDay; current <= maxDay; current = shiftFeedingDayKey(current, 1)) {
    items.push(current);
  }
  return items;
}

export function formatFeedingDayLabel(dayKey: string) {
  const parts = dayParts(dayKey);
  if (!parts) {
    return dayKey;
  }
  return `${parts.month}月${parts.day}日`;
}

export function formatFeedingDayNumber(dayKey: string) {
  const parts = dayParts(dayKey);
  if (!parts) {
    return dayKey;
  }
  return `${parts.day}`;
}

export function formatFeedingWeekday(dayKey: string, todayDay?: string) {
  if (todayDay && dayKey === todayDay) {
    return "今日";
  }
  const parts = dayParts(dayKey);
  if (!parts) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    weekday: "short"
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function isTodayFeedingDay(dayKey: string, timeZone: string, now = new Date()) {
  return dayKey === feedingTodayDayKey(timeZone, now);
}

export function isFutureFeedingDay(dayKey: string, timeZone: string, now = new Date()) {
  return dayKey > feedingTodayDayKey(timeZone, now);
}

export function formatFeedingTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function formatFeedingRelative(value: string, now = new Date()) {
  const diffMs = now.getTime() - new Date(value).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes > 0 ? `${hours}小时${minutes}分钟前` : `${hours}小时前`;
}

export function formatFeedingDuration(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return "0分钟";
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}分钟`;
  }
  return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
}

export function formatFeedingAgeForDayKey(birthDate: string, dayKey: string) {
  const birthKey = extractIsoDayKey(birthDate);
  const birth = dayParts(birthKey);
  const target = dayParts(dayKey);
  if (!birth || !target) {
    return "1天";
  }
  if (dayKey <= birthKey) {
    return "1天";
  }

  let years = target.year - birth.year;
  let months = target.month - birth.month;
  let days = target.day - birth.day;

  if (days < 0) {
    const previousMonthLastDay = new Date(Date.UTC(target.year, target.month - 1, 0)).getUTCDate();
    days += previousMonthLastDay;
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }
  if (years > 0) {
    return `${years}岁${months}个月${days}天`;
  }
  if (months > 0) {
    return `${months}个月${days}天`;
  }
  return `${Math.max(days, 1)}天`;
}

export function buildFeedingSummaryCards(summary: FeedingSummary) {
  const cards: FeedingSummaryCard[] = [];

  if (summary.milk.breastCount > 0 || summary.milk.breastMinutes > 0) {
    cards.push({
      key: "milk-breast",
      label: "亲喂",
      value: summary.milk.breastMinutes > 0 ? formatFeedingDuration(summary.milk.breastMinutes) : `${summary.milk.breastCount}次`,
      detail: summary.milk.breastCount > 0 ? `${summary.milk.breastCount}次` : ""
    });
  }

  const bottleCount = summary.milk.bottleCount + summary.milk.formulaCount;
  if (bottleCount > 0 || summary.milk.totalMl > 0) {
    cards.push({
      key: "milk-bottle",
      label: "瓶喂",
      value: summary.milk.totalMl > 0 ? `${summary.milk.totalMl}ml` : `${bottleCount}次`,
      detail: bottleCount > 0 ? `${bottleCount}次` : ""
    });
  }

  if (summary.diaper.count > 0) {
    cards.push({
      key: "diaper",
      label: "换尿布",
      value: `${summary.diaper.count}次`,
      detail: summary.diaper.stoolCount > 0 ? `便便${summary.diaper.stoolCount}次` : "无便便"
    });
  }

  if (summary.solid.count > 0) {
    cards.push({
      key: "solid",
      label: "辅食",
      value: `${summary.solid.count}次`,
      detail: ""
    });
  }

  if (summary.supplement.count > 0) {
    cards.push({
      key: "supplement",
      label: "营养品",
      value: `${summary.supplement.count}次`,
      detail: ""
    });
  }

  if (summary.medicine.count > 0) {
    cards.push({
      key: "medicine",
      label: "药品",
      value: `${summary.medicine.count}次`,
      detail: ""
    });
  }

  if (summary.sleep.count > 0) {
    cards.push({
      key: "sleep",
      label: "睡眠",
      value: `${summary.sleep.count}次`,
      detail: summary.sleep.totalMinutes > 0 ? formatFeedingDuration(summary.sleep.totalMinutes) : "进行中"
    });
  }

  return cards;
}

export function feedingEntryHeadline(entry: FeedingEntry) {
  switch (entry.category) {
    case "milk":
      return formatMilkMode(entry.milkMode);
    case "solid":
      return entry.foodName?.trim() || "辅食";
    case "diaper":
      return "换尿布";
    case "sleep":
      return "睡眠";
    case "supplement":
      return "营养品";
    case "medicine":
      return "药品";
    default:
      return "喂养记录";
  }
}

export function feedingEntryDetail(entry: FeedingEntry) {
  switch (entry.category) {
    case "milk":
      if (entry.milkMode === "breast" && entry.endedAt) {
        const minutes = Math.max(1, Math.round((new Date(entry.endedAt).getTime() - new Date(entry.occurredAt).getTime()) / 60000));
        return formatFeedingDuration(minutes);
      }
      if (entry.milkMode === "breast") {
        return "待补结束时间";
      }
      return entry.amountMl ? `${entry.amountMl}ml` : "";
    case "solid":
      return "吃辅食";
    case "diaper":
      return entry.hasStool ? "有便便" : "无便便";
    case "sleep":
      if (!entry.endedAt) {
        return "进行中";
      }
      return formatFeedingDuration(Math.max(1, Math.round((new Date(entry.endedAt).getTime() - new Date(entry.occurredAt).getTime()) / 60000)));
    case "supplement":
    case "medicine":
      return formatEntryItems(entry.items);
    default:
      return "";
  }
}

export function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function dayKeyToDefaultDateTimeLocal(dayKey: string, now = new Date()) {
  const todayKey = now.toISOString().slice(0, 10);
  if (dayKey === todayKey) {
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
  return `${dayKey}T09:00`;
}

export function buildFeedingSummary(entries: FeedingEntry[]): FeedingSummary {
  const summary = emptyFeedingSummary();

  for (const entry of entries) {
    switch (entry.category) {
      case "milk":
        if (entry.milkMode === "breast") {
          if (entry.endedAt) {
            summary.milk.count += 1;
            summary.milk.breastCount += 1;
            const minutes = Math.max(1, Math.round((new Date(entry.endedAt).getTime() - new Date(entry.occurredAt).getTime()) / 60000));
            summary.milk.breastMinutes += minutes;
          }
        } else if (entry.milkMode === "bottle") {
          summary.milk.count += 1;
          summary.milk.bottleCount += 1;
        } else if (entry.milkMode === "formula") {
          summary.milk.count += 1;
          summary.milk.formulaCount += 1;
        }
        if (entry.amountMl) {
          summary.milk.totalMl += entry.amountMl;
        }
        break;
      case "diaper":
        summary.diaper.count += 1;
        if (entry.hasStool) {
          summary.diaper.stoolCount += 1;
        }
        break;
      case "solid":
        summary.solid.count += 1;
        break;
      case "supplement":
        summary.supplement.count += 1;
        summary.supplement.itemCount = (summary.supplement.itemCount ?? 0) + entry.items.length;
        break;
      case "medicine":
        summary.medicine.count += 1;
        summary.medicine.itemCount = (summary.medicine.itemCount ?? 0) + entry.items.length;
        break;
      case "sleep":
        summary.sleep.count += 1;
        if (entry.endedAt) {
          const minutes = Math.max(1, Math.round((new Date(entry.endedAt).getTime() - new Date(entry.occurredAt).getTime()) / 60000));
          summary.sleep.totalMinutes += minutes;
        }
        break;
    }
  }

  return summary;
}

export function sortFeedingEntries(entries: FeedingEntry[]) {
  return [...entries].sort((left, right) => {
    const occurredDiff = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
    if (occurredDiff !== 0) {
      return occurredDiff;
    }
    const createdDiff = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    if (createdDiff !== 0) {
      return createdDiff;
    }
    return right.id.localeCompare(left.id);
  });
}

export function normalizeFeedingDayPayload(day: FeedingDayPayload) {
  return {
    ...day,
    entries: sortFeedingEntries(day.entries)
  };
}
