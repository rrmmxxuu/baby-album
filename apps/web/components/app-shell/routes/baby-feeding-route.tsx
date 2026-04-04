"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, applyFeedingTimerAction, createFeedingEntry, deleteFeedingEntry, feedingTimerStreamUrl, FeedingTimerConflictError, finishFeedingTimer, loadFeedingDay, loadFeedingTimer, updateFeedingEntry } from "../../../lib/api";
import type { BreastFeedingTimerSession, FeedingCategory, FeedingDayPayload, FeedingEntry, FeedingEntryItemInput, FeedingEntryUpsertInput, FeedingMilkMode, FeedingTimerSide } from "../../../lib/types";
import { useBabyRouteContext } from "../baby-route-context";
import { canAccessFeeding } from "../model/babies";
import {
  activeBreastTimerDetail,
  buildFeedingSummary,
  buildFeedingDayStrip,
  buildFeedingSummaryCards,
  clampFeedingDayKey,
  extractFeedingDayKey,
  FEEDING_DOSE_UNITS,
  feedingEntryDetail,
  feedingEntryHeadline,
  feedingTimerSnapshot,
  feedingTodayDayKey,
  formatFeedingClock,
  formatFeedingAgeForDayKey,
  formatFeedingDayNumber,
  formatFeedingRelative,
  formatFeedingTime,
  formatFeedingWeekday,
  isFeedingComposerKind,
  isFutureFeedingDay,
  isTodayFeedingDay,
  MEDICINE_PRESETS,
  normalizeFeedingDayKey,
  normalizeFeedingDayPayload,
  sortFeedingEntries,
  shiftFeedingDayKey,
  SUPPLEMENT_PRESETS,
  toDateTimeLocalValue
} from "../model/feeding";
import { errorMessageFromUnknown } from "../model/feedback";
import { formatDate } from "../model/format";
import { buildAuthPath, buildBabyFeedingPath, buildFeedingHubPath } from "../model/routes";
import { BabyAvatar } from "../ui/baby-avatar";
import { DateField } from "../ui/date-field";
import { TimeField } from "../ui/time-field";
import { PanelMessage } from "../../ui/panel-message";
import { FeedingContentLoadingSkeleton } from "../ui/loading-skeletons";

const LAST_FEEDING_MILK_MODE_STORAGE_PREFIX = "baby-album.lastFeedingMilkMode";
const TIMER_RECONNECT_DELAY_MS = 2500;

type BreastTimingMode = "automatic" | "manual";

interface FeedingDraftItem {
  id: string;
  name: string;
  dose: string;
}

interface FeedingDraftState {
  occurredAt: string;
  endedAt: string;
  note: string;
  milkMode: FeedingMilkMode;
  breastTimingMode: BreastTimingMode;
  breastLeftMinutes: string;
  breastRightMinutes: string;
  amountMl: string;
  foodName: string;
  hasStool: "yes" | "no";
  items: FeedingDraftItem[];
}

interface FeedingActionConfig {
  kind: FeedingCategory;
  label: string;
  noun: string;
  shortLabel: string;
  tone: "milk" | "solid" | "diaper" | "sleep" | "supplement" | "medicine";
}

interface FeedingDateStripProps {
  maxDay: string;
  minDay: string;
  selectedDay: string;
  todayDay: string;
  onSelect: (dayKey: string) => void;
}

interface FeedingTimelineProps {
  activeBreastTimer: BreastFeedingTimerSession | null;
  entries: FeedingEntry[];
  showRelativeTime: boolean;
  timeZone: string;
  onEdit: (entryId: string) => void;
  onOpenActiveTimer: () => void;
}

interface FeedingActionDockProps {
  disabled: boolean;
  expanded: boolean;
  onSelect: (kind: FeedingCategory) => void;
  onToggle: () => void;
}

interface FeedingEditorSheetProps {
  activeBreastTimer: BreastFeedingTimerSession | null;
  category: FeedingCategory;
  deleting: boolean;
  draft: FeedingDraftState;
  editingEntry: FeedingEntry | null;
  onCancelActiveTimer: () => void;
  onAddItem: () => void;
  onAddPreset: (name: string) => void;
  onChange: (patch: Partial<FeedingDraftState>) => void;
  onClose: () => void;
  onDelete: () => void;
  onFinishActiveTimer: () => void;
  onOpenActiveTimerDay: () => void;
  onTimerPrimaryAction: (side: FeedingTimerSide) => void;
  onRemoveItem: (itemId: string) => void;
  onSave: () => void;
  onUpdateItem: (itemId: string, patch: Partial<FeedingDraftItem>) => void;
  saving: boolean;
  timerBusy: boolean;
  timerNow: Date;
  timeZone: string;
}

interface FeedingDoseDialogProps {
  amount: string;
  onAmountChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onUnitSelect: (unit: string) => void;
  open: boolean;
  selectedUnit: string;
}

const FEEDING_ACTIONS: FeedingActionConfig[] = [
  { kind: "milk", label: "记喂奶", noun: "喂奶", shortLabel: "奶", tone: "milk" },
  { kind: "solid", label: "记辅食", noun: "辅食", shortLabel: "辅", tone: "solid" },
  { kind: "diaper", label: "换尿布", noun: "换尿布", shortLabel: "尿", tone: "diaper" },
  { kind: "sleep", label: "记睡眠", noun: "睡眠", shortLabel: "睡", tone: "sleep" },
  { kind: "supplement", label: "记营养品", noun: "营养品", shortLabel: "营", tone: "supplement" },
  { kind: "medicine", label: "记药品", noun: "药品", shortLabel: "药", tone: "medicine" }
];

const EMPTY_DAY_PAYLOAD: FeedingDayPayload = {
  day: "",
  summary: {
    milk: { count: 0, breastCount: 0, bottleCount: 0, formulaCount: 0, totalMl: 0, breastMinutes: 0 },
    diaper: { count: 0, stoolCount: 0 },
    solid: { count: 0 },
    supplement: { count: 0, itemCount: 0 },
    medicine: { count: 0, itemCount: 0 },
    sleep: { count: 0, totalMinutes: 0 }
  },
  entries: []
};

function draftItem(name = "", dose = ""): FeedingDraftItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    dose
  };
}

function defaultOccurredAt(selectedDay: string, isToday: boolean) {
  if (isToday) {
    return toDateTimeLocalValue(new Date().toISOString());
  }
  return `${selectedDay}T09:00`;
}

function defaultEndedAtForPendingEntry(category: FeedingCategory, entry: FeedingEntry) {
  if (entry.endedAt) {
    return toDateTimeLocalValue(entry.endedAt);
  }
  if (category === "sleep" || (category === "milk" && entry.milkMode === "breast")) {
    return toDateTimeLocalValue(new Date().toISOString());
  }
  return "";
}

function isStoredFeedingMilkMode(value: string | null): value is FeedingMilkMode {
  return value === "breast" || value === "bottle" || value === "formula";
}

function readStoredFeedingMilkMode(storageKey: string) {
  if (typeof window === "undefined") {
    return "formula" as FeedingMilkMode;
  }
  const storedMode = window.localStorage.getItem(storageKey);
  return isStoredFeedingMilkMode(storedMode) ? storedMode : "formula";
}

function hasBreastSideBreakdown(entry?: FeedingEntry | null) {
  if (!entry || entry.category !== "milk" || entry.milkMode !== "breast") {
    return false;
  }
  return typeof entry.breastLeftSeconds === "number" || typeof entry.breastRightSeconds === "number";
}

function latestRecordedMilkMode(entries: FeedingEntry[]) {
  for (const entry of entries) {
    if (entry.category === "milk" && entry.milkMode) {
      return entry.milkMode;
    }
  }
  return null;
}

function parseBreastMinutes(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function computeBreastEndedAt(occurredAt: string, leftMinutes: string, rightMinutes: string) {
  const startedAt = new Date(occurredAt);
  if (!Number.isFinite(startedAt.getTime())) {
    return "";
  }
  const left = parseBreastMinutes(leftMinutes) ?? 0;
  const right = parseBreastMinutes(rightMinutes) ?? 0;
  const totalMinutes = left + right;
  if (totalMinutes <= 0) {
    return "";
  }
  return toDateTimeLocalValue(new Date(startedAt.getTime() + totalMinutes * 60000).toISOString());
}

function splitLocalDateTime(value: string) {
  if (!value) {
    return { date: "", time: "" };
  }
  const [date = "", time = ""] = value.split("T");
  return {
    date,
    time: time.slice(0, 5)
  };
}

function joinLocalDateTime(date: string, time: string) {
  if (!date || !time) {
    return "";
  }
  return `${date}T${time}`;
}

interface FeedingDateTimeFieldProps {
  disabled?: boolean;
  fallbackDate?: string;
  fallbackTime?: string;
  label: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  value: string;
}

function FeedingDateTimeField({ disabled, fallbackDate = "", fallbackTime = "09:00", label, onChange, readOnly, value }: FeedingDateTimeFieldProps) {
  const { date, time } = splitLocalDateTime(value);
  const nextDateValue = date || fallbackDate;
  const nextTimeFallback = time || fallbackTime;
  const controlsDisabled = disabled || readOnly;

  return (
    <div className="feedingDateTimeGroup">
      <span className="feedingFieldLabel">{label}</span>
      <div className="feedingDateTimeInputs">
        <DateField
          disabled={controlsDisabled}
          label="日期"
          onChange={(nextDate) => onChange(joinLocalDateTime(nextDate, nextTimeFallback))}
          value={nextDateValue}
        />
        <TimeField
          disabled={controlsDisabled || !nextDateValue}
          label="时间"
          onChange={(nextTime) => onChange(joinLocalDateTime(nextDateValue, nextTime))}
          value={time}
        />
      </div>
    </div>
  );
}

function createInitialDraft(category: FeedingCategory, selectedDay: string, isToday: boolean, preferredMilkMode: FeedingMilkMode, entry?: FeedingEntry | null): FeedingDraftState {
  if (entry) {
    const breastLeftMinutes = typeof entry.breastLeftSeconds === "number" ? `${Math.round(entry.breastLeftSeconds / 60)}` : "";
    const breastRightMinutes = typeof entry.breastRightSeconds === "number" ? `${Math.round(entry.breastRightSeconds / 60)}` : "";
    return {
      occurredAt: toDateTimeLocalValue(entry.occurredAt),
      endedAt: defaultEndedAtForPendingEntry(category, entry),
      note: entry.note ?? "",
      milkMode: entry.milkMode ?? "formula",
      breastTimingMode: "manual",
      breastLeftMinutes,
      breastRightMinutes,
      amountMl: entry.amountMl ? `${entry.amountMl}` : "",
      foodName: entry.foodName ?? "",
      hasStool: entry.hasStool ? "yes" : "no",
      items: entry.items.length > 0 ? entry.items.map((item) => draftItem(item.name, item.dose ?? "")) : [draftItem()]
    };
  }
  return {
    occurredAt: defaultOccurredAt(selectedDay, isToday),
    endedAt: category === "sleep" ? "" : "",
    note: "",
    milkMode: category === "milk" ? preferredMilkMode : "formula",
    breastTimingMode: "automatic",
    breastLeftMinutes: "",
    breastRightMinutes: "",
    amountMl: "",
    foodName: "",
    hasStool: "no",
    items: category === "supplement" || category === "medicine" ? [draftItem()] : [draftItem()]
  };
}

function editorTitle(category: FeedingCategory, editing: boolean) {
  const action = FEEDING_ACTIONS.find((item) => item.kind === category);
  return editing ? `编辑${action?.noun ?? "记录"}` : action?.label ?? "记录喂养";
}

function categoryPresets(category: FeedingCategory) {
  if (category === "supplement") {
    return [...SUPPLEMENT_PRESETS];
  }
  if (category === "medicine") {
    return [...MEDICINE_PRESETS];
  }
  return [];
}

function parseDoseValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { amount: "", unit: "" };
  }
  const normalized = trimmed.replace(/毫升|ml|mL|ML/g, "毫升");
  const match = normalized.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!match) {
    return { amount: "", unit: "" };
  }
  const unit = match[2].trim();
  return {
    amount: match[1],
    unit: FEEDING_DOSE_UNITS.includes(unit as typeof FEEDING_DOSE_UNITS[number]) ? unit : ""
  };
}

function formatDoseValue(amount: string, unit: string) {
  const normalizedAmount = amount.trim();
  if (!normalizedAmount || !unit) {
    return "";
  }
  return `${normalizedAmount}${unit}`;
}

function buildEntryPayload(category: FeedingCategory, draft: FeedingDraftState, editingEntry?: FeedingEntry | null): FeedingEntryUpsertInput {
  const payload: FeedingEntryUpsertInput = {
    category,
    occurredAt: new Date(draft.occurredAt).toISOString(),
    note: draft.note.trim()
  };

  if (draft.endedAt) {
    payload.endedAt = new Date(draft.endedAt).toISOString();
  }

  switch (category) {
    case "milk":
      payload.milkMode = draft.milkMode;
      if (draft.milkMode === "breast" && hasBreastSideBreakdown(editingEntry)) {
        const leftMinutes = parseBreastMinutes(draft.breastLeftMinutes) ?? 0;
        const rightMinutes = parseBreastMinutes(draft.breastRightMinutes) ?? 0;
        const totalSeconds = (leftMinutes + rightMinutes) * 60;
        if (totalSeconds > 0) {
          payload.breastLeftSeconds = leftMinutes * 60;
          payload.breastRightSeconds = rightMinutes * 60;
          payload.endedAt = new Date(new Date(draft.occurredAt).getTime() + totalSeconds * 1000).toISOString();
        }
      }
      if (draft.milkMode === "bottle" || draft.milkMode === "formula") {
        const amount = Number.parseInt(draft.amountMl, 10);
        if (Number.isFinite(amount)) {
          payload.amountMl = amount;
        }
      }
      break;
    case "solid":
      payload.foodName = draft.foodName.trim();
      break;
    case "diaper":
      payload.hasStool = draft.hasStool === "yes";
      break;
    case "sleep":
      break;
    case "supplement":
    case "medicine":
      payload.items = draft.items
        .map((item): FeedingEntryItemInput => ({
          name: item.name.trim(),
          dose: item.dose.trim() || undefined
        }))
        .filter((item) => item.name);
      break;
  }

  return payload;
}

function canSubmitDraft(category: FeedingCategory, draft: FeedingDraftState, editingEntry?: FeedingEntry | null) {
  if (!draft.occurredAt) {
    return false;
  }
  switch (category) {
    case "milk":
      if (draft.milkMode === "breast") {
        if (hasBreastSideBreakdown(editingEntry)) {
          return (parseBreastMinutes(draft.breastLeftMinutes) ?? 0) + (parseBreastMinutes(draft.breastRightMinutes) ?? 0) > 0;
        }
        return draft.breastTimingMode === "manual" ? Boolean(draft.endedAt) : false;
      }
      return Number.parseInt(draft.amountMl, 10) > 0;
    case "solid":
      return Boolean(draft.foodName.trim());
    case "diaper":
      return true;
    case "sleep":
      return true;
    case "supplement":
    case "medicine":
      return draft.items.some((item) => item.name.trim());
    default:
      return false;
  }
}

function FeedingDateStrip({ maxDay, minDay, selectedDay, todayDay, onSelect }: FeedingDateStripProps) {
  const items = useMemo(() => buildFeedingDayStrip(minDay, maxDay), [maxDay, minDay]);
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = stripRef.current;
    if (!container) {
      return;
    }
    const selectedChip = container.querySelector<HTMLButtonElement>(`button[data-day-key="${selectedDay}"]`);
    if (!selectedChip) {
      return;
    }
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const centeredLeft = selectedChip.offsetLeft - (container.clientWidth - selectedChip.offsetWidth) / 2;
    const targetLeft = Math.min(maxScrollLeft, Math.max(0, centeredLeft));
    container.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [selectedDay]);

  return (
    <div className="feedingDateStrip surfaceCard" ref={stripRef} role="list" aria-label="日期选择">
      {items.map((dayKey) => {
        const selected = dayKey === selectedDay;
        return (
          <button
            key={dayKey}
            aria-pressed={selected}
            className={`feedingDateChip${selected ? " feedingDateChipActive" : ""}`}
            data-day-key={dayKey}
            onClick={() => onSelect(dayKey)}
            type="button"
          >
            <span className="feedingDateWeekday">{formatFeedingWeekday(dayKey, todayDay)}</span>
            <strong className="feedingDateNumber">{formatFeedingDayNumber(dayKey)}</strong>
          </button>
        );
      })}
    </div>
  );
}

function ActiveBreastTimerTimelineCard({ onOpen, session, showRelativeTime, timeZone }: { onOpen: () => void; session: BreastFeedingTimerSession; showRelativeTime: boolean; timeZone: string; }) {
  return (
    <article className="feedingTimelineRow">
      <div className="feedingTimelineTime">
        <strong>{formatFeedingTime(session.startedAt, timeZone)}</strong>
        {showRelativeTime ? <span>{formatFeedingRelative(session.startedAt)}</span> : null}
      </div>

      <button className="feedingEntryCard feedingEntryCardActiveTimer surfaceCard surfaceCardAction" onClick={onOpen} type="button">
        <span className="feedingEntryBadge feedingEntryBadgeMilk">亲</span>
        <span className="feedingEntryBody">
          <span className="feedingEntryPrimaryRow">
            <strong>亲喂计时中</strong>
            <span>{activeBreastTimerDetail(session)}</span>
          </span>
          <span className="feedingEntryMeta">开始于 {formatFeedingTime(session.startedAt, timeZone)}</span>
          <span className="feedingEntryMeta">最后操作：{session.updatedByName || session.updatedBy}</span>
        </span>
      </button>
    </article>
  );
}

function FeedingTimeline({ activeBreastTimer, entries, showRelativeTime, timeZone, onEdit, onOpenActiveTimer }: FeedingTimelineProps) {
  if (entries.length === 0 && !activeBreastTimer) {
    return <PanelMessage message="这一天还没有喂养记录。" />;
  }

  return (
    <div className="feedingTimeline">
      {activeBreastTimer ? <ActiveBreastTimerTimelineCard onOpen={onOpenActiveTimer} session={activeBreastTimer} showRelativeTime={showRelativeTime} timeZone={timeZone} /> : null}
      {entries.map((entry) => {
        const action = FEEDING_ACTIONS.find((item) => item.kind === entry.category);
        return (
          <article className="feedingTimelineRow" key={entry.id}>
            <div className="feedingTimelineTime">
              <strong>{formatFeedingTime(entry.occurredAt, timeZone)}</strong>
              {showRelativeTime ? <span>{formatFeedingRelative(entry.occurredAt)}</span> : null}
            </div>

            <button className={`feedingEntryCard surfaceCard surfaceCardAction feedingEntryCard${action ? ` feedingEntryCard${action.tone[0].toUpperCase()}${action.tone.slice(1)}` : ""}`} onClick={() => onEdit(entry.id)} type="button">
              <span className={`feedingEntryBadge feedingEntryBadge${action ? action.tone[0].toUpperCase() + action.tone.slice(1) : "Milk"}`}>{action?.shortLabel ?? "记"}</span>
              <span className="feedingEntryBody">
                <span className="feedingEntryPrimaryRow">
                  <strong>{feedingEntryHeadline(entry)}</strong>
                  <span>{feedingEntryDetail(entry)}</span>
                </span>
                {entry.endedAt ? <span className="feedingEntryMeta">{`${formatFeedingTime(entry.occurredAt, timeZone)} - ${formatFeedingTime(entry.endedAt, timeZone)}`}</span> : null}
                {entry.note ? <span className="feedingEntryNote">{entry.note}</span> : null}
                <span className="feedingEntryMeta">记录人：{entry.createdByName || entry.createdBy}</span>
              </span>
            </button>
          </article>
        );
      })}
    </div>
  );
}

function FeedingActionDock({ disabled, expanded, onSelect, onToggle }: FeedingActionDockProps) {
  const primaryActions = FEEDING_ACTIONS.slice(0, 3);
  const secondaryActions = FEEDING_ACTIONS.slice(3);

  function renderAction(action: FeedingActionConfig) {
    return (
      <button
        className="feedingActionButton"
        disabled={disabled}
        key={action.kind}
        onClick={() => onSelect(action.kind)}
        type="button"
      >
        <span className={`feedingActionIcon feedingActionIcon${action.tone[0].toUpperCase()}${action.tone.slice(1)}`}>{action.shortLabel}</span>
        <span>{action.label}</span>
      </button>
    );
  }

  return (
    <aside className={`feedingActionDock surfaceCard${expanded ? " feedingActionDockExpanded" : ""}`}>
      <button
        aria-expanded={expanded}
        aria-label={expanded ? "收起更多记录按钮" : "展开更多记录按钮"}
        className={`feedingActionToggle${expanded ? " feedingActionToggleExpanded" : ""}`}
        onClick={onToggle}
        type="button"
      >
        <svg aria-hidden="true" className="feedingActionToggleIcon" fill="none" height="12" viewBox="0 0 12 12" width="12">
          <path d="M2.25 4.5 6 8.25 9.75 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      </button>
      {expanded ? (
        <div className="feedingActionGrid feedingActionGridSecondary">
          {secondaryActions.map(renderAction)}
        </div>
      ) : null}
      <div className="feedingActionGrid">
        {primaryActions.map(renderAction)}
      </div>
      {disabled ? <p className="helperText feedingActionHint">未来日期只可浏览，不能新增记录。</p> : null}
    </aside>
  );
}

function FeedingDoseDialog({ amount, onAmountChange, onClose, onSave, onUnitSelect, open, selectedUnit }: FeedingDoseDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="feedingDoseOverlay" role="presentation">
      <section aria-modal="true" className="feedingDoseDialog surfaceCard" role="dialog" aria-label="填写剂量">
        <header className="feedingDoseHeader">
          <span className="feedingDoseSpacer" />
          <h3>填写剂量</h3>
          <button aria-label="关闭填写剂量" className="secondaryButton feedingDoseClose" onClick={onClose} type="button">×</button>
        </header>
        <div className="feedingDoseBody">
          <label>
            用量
            <input
              autoFocus
              inputMode="decimal"
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="请输入数字"
              value={amount}
            />
          </label>
          <div className="feedingDoseUnitBlock">
            <span className="feedingFieldLabel">单位</span>
            <div className="feedingDoseUnitGrid">
              {FEEDING_DOSE_UNITS.map((unit) => (
                <button
                  className={`secondaryButton feedingDoseUnitButton${selectedUnit === unit ? " feedingDoseUnitButtonActive" : ""}`}
                  key={unit}
                  onClick={() => onUnitSelect(unit)}
                  type="button"
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>
          <button className="primaryButton feedingDoseSave" onClick={onSave} type="button">保存</button>
        </div>
      </section>
    </div>
  );
}

function FeedingEditorSheet({
  activeBreastTimer,
  category,
  deleting,
  draft,
  editingEntry,
  onCancelActiveTimer,
  onAddItem,
  onAddPreset,
  onChange,
  onClose,
  onDelete,
  onFinishActiveTimer,
  onOpenActiveTimerDay,
  onTimerPrimaryAction,
  onRemoveItem,
  onSave,
  onUpdateItem,
  saving,
  timerBusy,
  timerNow,
  timeZone
}: FeedingEditorSheetProps) {
  const presets = categoryPresets(category);
  const canDelete = Boolean(editingEntry);
  const [doseDialogItemId, setDoseDialogItemId] = useState("");
  const [doseAmount, setDoseAmount] = useState("");
  const [doseUnit, setDoseUnit] = useState("");
  const activeTimerLocked = category === "milk" && !editingEntry && Boolean(activeBreastTimer);
  const automaticBreastMode = category === "milk" && draft.milkMode === "breast" && !editingEntry && draft.breastTimingMode === "automatic";
  const timedBreastEntryEditing = category === "milk" && draft.milkMode === "breast" && hasBreastSideBreakdown(editingEntry);
  const timerSnapshot = activeBreastTimer ? feedingTimerSnapshot(activeBreastTimer, timerNow) : {
    activeSide: undefined,
    leftElapsedSeconds: 0,
    rightElapsedSeconds: 0,
    totalElapsedSeconds: 0
  };
  const headerPrimaryDisabled = automaticBreastMode ? !activeBreastTimer || timerBusy : saving;
  const headerPrimaryLabel = automaticBreastMode
    ? timerBusy ? "同步中" : activeBreastTimer ? "结束并保存" : "开始后保存"
    : saving ? "保存中" : "保存";
  const headerPrimaryAction = automaticBreastMode ? onFinishActiveTimer : onSave;

  useEffect(() => {
    setDoseDialogItemId("");
    setDoseAmount("");
    setDoseUnit("");
  }, [category, editingEntry?.id]);

  function openDoseDialog(itemId: string, currentDose: string) {
    const parsed = parseDoseValue(currentDose);
    setDoseDialogItemId(itemId);
    setDoseAmount(parsed.amount);
    setDoseUnit(parsed.unit);
  }

  function closeDoseDialog() {
    setDoseDialogItemId("");
  }

  function saveDoseDialog() {
    if (!doseDialogItemId) {
      return;
    }
    onUpdateItem(doseDialogItemId, { dose: formatDoseValue(doseAmount, doseUnit) });
    setDoseDialogItemId("");
  }

  function updateBreastMinutes(side: "left" | "right", value: string) {
    const nextPatch = side === "left"
      ? { breastLeftMinutes: value }
      : { breastRightMinutes: value };
    const nextLeft = side === "left" ? value : draft.breastLeftMinutes;
    const nextRight = side === "right" ? value : draft.breastRightMinutes;
    onChange({
      ...nextPatch,
      endedAt: computeBreastEndedAt(draft.occurredAt, nextLeft, nextRight)
    });
  }

  function updateBreastOccurredAt(value: string) {
    onChange({
      occurredAt: value,
      endedAt: computeBreastEndedAt(value, draft.breastLeftMinutes, draft.breastRightMinutes)
    });
  }

  const itemFieldLabel = category === "supplement" ? "记录营养品" : "记录药品";

  return (
    <div className="draftSheetOverlay draftSheetOverlayOpen" role="presentation">
      <section aria-modal="true" className="draftSheet draftSheetOpen feedingSheet" role="dialog">
        <header className="draftSheetHeader">
          <button className="draftTopAction" onClick={onClose} type="button">返回</button>
          <h2>{editorTitle(category, canDelete)}</h2>
          <button className="draftTopPrimary" disabled={headerPrimaryDisabled} onClick={headerPrimaryAction} type="button">{headerPrimaryLabel}</button>
        </header>

        <div className="draftPage feedingSheetBody">
          <div className="panel panelStack feedingEditorPanel">
            {(category === "milk" || category === "solid" || category === "diaper" || category === "sleep" || category === "supplement" || category === "medicine") ? (
              <div className="feedingEditorFields">
                {category === "milk" ? (
                  <>
                    <div className="feedingSegmentGroup">
                      <span className="feedingFieldLabel">喂奶方式</span>
                      <div aria-label="喂奶方式" className="segmentedControl feedingSegmentedControl feedingSegmentedControlThree" role="tablist">
                        <button
                          className={`segmentedControlButton${draft.milkMode === "breast" ? " segmentedControlButtonActive" : ""}`}
                          disabled={activeTimerLocked}
                          onClick={() => onChange({ milkMode: "breast" })}
                          type="button"
                        >
                          亲喂
                        </button>
                        <button
                          className={`segmentedControlButton${draft.milkMode === "bottle" ? " segmentedControlButtonActive" : ""}`}
                          disabled={activeTimerLocked}
                          onClick={() => onChange({ milkMode: "bottle" })}
                          type="button"
                        >
                          瓶喂
                        </button>
                        <button
                          className={`segmentedControlButton${draft.milkMode === "formula" ? " segmentedControlButtonActive" : ""}`}
                          disabled={activeTimerLocked}
                          onClick={() => onChange({ milkMode: "formula" })}
                          type="button"
                        >
                          配方奶
                        </button>
                      </div>
                    </div>

                    {draft.milkMode === "breast" && !editingEntry ? (
                      <div className="feedingSegmentGroup">
                        <span className="feedingFieldLabel">计时方式</span>
                        <div aria-label="计时方式" className="segmentedControl feedingSegmentedControl" role="tablist">
                          <button
                            className={`segmentedControlButton${draft.breastTimingMode === "automatic" ? " segmentedControlButtonActive" : ""}`}
                            onClick={() => onChange({ breastTimingMode: "automatic" })}
                            type="button"
                          >
                            自动计时
                          </button>
                          <button
                            className={`segmentedControlButton${draft.breastTimingMode === "manual" ? " segmentedControlButtonActive" : ""}`}
                            disabled={Boolean(activeBreastTimer)}
                            onClick={() => onChange({ breastTimingMode: "manual" })}
                            type="button"
                          >
                            手动计时
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {category === "milk" && draft.milkMode === "breast" && !editingEntry && draft.breastTimingMode === "automatic" ? (
                  <div className="feedingTimerPanel">
                    <div className="feedingTimerSummary">
                      <span className="feedingTimerSummaryLabel">总时长</span>
                      <strong>{formatFeedingClock(timerSnapshot.totalElapsedSeconds)}</strong>
                      <p>{activeBreastTimer ? activeBreastTimer.status === "paused" ? "已暂停，可选择任意一侧继续" : "点击左右按钮开始 / 暂停 / 切边" : "点击任意一侧开始计时"}</p>
                    </div>

                    <div className="feedingTimerSideGrid">
                      {(["left", "right"] as const).map((side) => {
                        const running = activeBreastTimer?.status === "running" && activeBreastTimer.activeSide === side;
                        const seconds = side === "left" ? timerSnapshot.leftElapsedSeconds : timerSnapshot.rightElapsedSeconds;
                        const title = side === "left" ? "左侧" : "右侧";
                        return (
                          <button className={`feedingTimerSideButton${running ? " feedingTimerSideButtonActive" : ""}`} key={side} onClick={() => onTimerPrimaryAction(side)} type="button">
                            <span className="feedingTimerSideLabel">{title}</span>
                            <strong>{formatFeedingClock(seconds)}</strong>
                            <span className="feedingTimerSideAction">{running ? "暂停" : activeBreastTimer ? "开始" : "开始"}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="feedingTimerMeta">
                      <div className="feedingTimerMetaRow">
                        <span className="feedingFieldLabel">开始时间</span>
                        <span>{activeBreastTimer ? formatFeedingTime(activeBreastTimer.startedAt, timeZone) : "开始后自动记录"}</span>
                      </div>
                      {activeBreastTimer ? (
                        <>
                          <div className="feedingTimerMetaRow">
                            <span className="feedingFieldLabel">当前状态</span>
                            <span>{activeBreastTimerDetail(activeBreastTimer, timerNow)}</span>
                          </div>
                          <div className="feedingTimerMetaRow">
                            <span className="feedingFieldLabel">最后操作</span>
                            <span>{activeBreastTimer.updatedByName || activeBreastTimer.updatedBy}</span>
                          </div>
                        </>
                      ) : null}
                    </div>

                    {activeBreastTimer && activeBreastTimer.dayKey !== draft.occurredAt.slice(0, 10) ? (
                      <button className="secondaryButton feedingTimerMetaButton" onClick={onOpenActiveTimerDay} type="button">跳到进行中日期</button>
                    ) : null}
                  </div>
                ) : timedBreastEntryEditing ? (
                  <>
                    <FeedingDateTimeField
                      fallbackDate={splitLocalDateTime(draft.occurredAt).date}
                      fallbackTime={splitLocalDateTime(draft.occurredAt).time || "09:00"}
                      label="开始时间"
                      onChange={updateBreastOccurredAt}
                      value={draft.occurredAt}
                    />

                    <label>
                      左侧（分钟）
                      <input inputMode="numeric" onChange={(event) => updateBreastMinutes("left", event.target.value)} placeholder="例如 12" value={draft.breastLeftMinutes} />
                    </label>

                    <label>
                      右侧（分钟）
                      <input inputMode="numeric" onChange={(event) => updateBreastMinutes("right", event.target.value)} placeholder="例如 8" value={draft.breastRightMinutes} />
                    </label>

                    <FeedingDateTimeField
                      disabled
                      fallbackDate={splitLocalDateTime(draft.occurredAt).date}
                      fallbackTime={splitLocalDateTime(draft.endedAt).time || splitLocalDateTime(draft.occurredAt).time || "09:00"}
                      label="结束时间"
                      onChange={() => {}}
                      readOnly
                      value={draft.endedAt}
                    />
                  </>
                ) : (
                  <>
                    <FeedingDateTimeField
                      fallbackDate={splitLocalDateTime(draft.occurredAt).date}
                      fallbackTime={splitLocalDateTime(draft.occurredAt).time || "09:00"}
                      label="记录时间"
                      onChange={(value) => onChange({ occurredAt: value })}
                      value={draft.occurredAt}
                    />

                    {category === "milk" && draft.milkMode === "breast" ? (
                      <FeedingDateTimeField
                        fallbackDate={splitLocalDateTime(draft.endedAt).date || splitLocalDateTime(draft.occurredAt).date}
                        fallbackTime={splitLocalDateTime(draft.endedAt).time || splitLocalDateTime(draft.occurredAt).time || "09:00"}
                        label="结束时间"
                        onChange={(value) => onChange({ endedAt: value })}
                        value={draft.endedAt}
                      />
                    ) : null}
                  </>
                )}

                {category === "sleep" ? (
                  <FeedingDateTimeField
                    fallbackDate={splitLocalDateTime(draft.endedAt).date || splitLocalDateTime(draft.occurredAt).date}
                    fallbackTime={splitLocalDateTime(draft.endedAt).time || splitLocalDateTime(draft.occurredAt).time || "09:00"}
                    label="睡醒时间"
                    onChange={(value) => onChange({ endedAt: value })}
                    value={draft.endedAt}
                  />
                ) : null}

                {category === "milk" && draft.milkMode !== "breast" ? (
                  <label>
                    奶量（ml）
                    <input inputMode="numeric" onChange={(event) => onChange({ amountMl: event.target.value })} placeholder="例如 90" value={draft.amountMl} />
                  </label>
                ) : null}

                {category === "solid" ? (
                  <label>
                    辅食名称
                    <input onChange={(event) => onChange({ foodName: event.target.value })} placeholder="例如 米粉 / 南瓜泥" value={draft.foodName} />
                  </label>
                ) : null}

                {category === "diaper" ? (
                  <div className="feedingSegmentGroup">
                    <span className="feedingFieldLabel">便便情况</span>
                    <div aria-label="便便情况" className="segmentedControl feedingSegmentedControl" role="tablist">
                      <button className={`segmentedControlButton${draft.hasStool === "no" ? " segmentedControlButtonActive" : ""}`} onClick={() => onChange({ hasStool: "no" })} type="button">无便便</button>
                      <button className={`segmentedControlButton${draft.hasStool === "yes" ? " segmentedControlButtonActive" : ""}`} onClick={() => onChange({ hasStool: "yes" })} type="button">有便便</button>
                    </div>
                  </div>
                ) : null}

                {category === "supplement" || category === "medicine" ? (
                  <>
                    <div className="feedingItemsBlock">
                      <div className="feedingItemsHeader">
                        <span className="feedingFieldLabel">{itemFieldLabel}</span>
                        <button className="secondaryButton feedingMiniButton" onClick={onAddItem} type="button">+添加</button>
                      </div>
                      <div className="feedingItemsList">
                        {draft.items.map((item) => (
                          <div className="feedingItemRow" key={item.id}>
                            <input onChange={(event) => onUpdateItem(item.id, { name: event.target.value })} placeholder={category === "supplement" ? "请输入营养品名称" : "请输入药品名称"} value={item.name} />
                            <button
                              className={`secondaryButton feedingDoseTrigger${item.dose ? " feedingDoseTriggerFilled" : ""}`}
                              onClick={() => openDoseDialog(item.id, item.dose)}
                              type="button"
                            >
                              {item.dose || "剂量(选填)"}
                            </button>
                            <button aria-label="删除条目" className="secondaryButton feedingItemRemove" onClick={() => onRemoveItem(item.id)} type="button">
                              <svg aria-hidden="true" className="feedingTrashIcon" fill="none" height="16" viewBox="0 0 16 16" width="16">
                                <path d="M6 2.75h4m-5 2h6.5m-5.75 0v6.25m2.5-6.25v6.25m2.5-6.25-.3 6.03a1 1 0 0 1-1 .97h-2.4a1 1 0 0 1-1-.97l-.3-6.03m1.05-2V2.5c0-.41.34-.75.75-.75h1.5c.41 0 .75.34.75.75v1.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {presets.length > 0 ? (
                      <div className="feedingPresetBlock">
                        <div className="feedingPresetHeader">
                          <span className="feedingFieldLabel">常用{category === "supplement" ? "营养品" : "药品"}</span>
                          <span className="helperText">点击标签快捷添加</span>
                        </div>
                        <div className="tagRow">
                          {presets.map((preset) => (
                            <button className="secondaryButton feedingPresetButton" key={preset} onClick={() => onAddPreset(preset)} type="button">{preset}</button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <label>
                  备注
                  <textarea onChange={(event) => onChange({ note: event.target.value })} placeholder="可选，记录补充说明" rows={4} value={draft.note} />
                </label>
              </div>
            ) : null}
          </div>
          {category === "milk" && draft.milkMode === "breast" && !editingEntry && draft.breastTimingMode === "automatic" ? (
            <p className="helperText feedingEditorHint">开始计时后返回，计时将继续。</p>
          ) : null}
        </div>

        <footer className="draftSheetFooter">
          {automaticBreastMode && activeBreastTimer ? (
            <button className="secondaryButton feedingDeleteButton" disabled={timerBusy} onClick={onCancelActiveTimer} type="button">{timerBusy ? "同步中" : "取消本次计时"}</button>
          ) : null}
          {canDelete ? (
            <button className="secondaryButton feedingDeleteButton" disabled={deleting || saving} onClick={onDelete} type="button">{deleting ? "删除中" : "删除记录"}</button>
          ) : null}
        </footer>
      </section>
      <FeedingDoseDialog
        amount={doseAmount}
        onAmountChange={setDoseAmount}
        onClose={closeDoseDialog}
        onSave={saveDoseDialog}
        onUnitSelect={setDoseUnit}
        open={Boolean(doseDialogItemId)}
        selectedUnit={doseUnit}
      />
    </div>
  );
}

export function BabyFeedingRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { babyId, workspace, session, appView } = useBabyRouteContext();
  const activeBaby = appView.activeBaby;
  const timeZone = workspace.album.timezone || "Asia/Shanghai";
  const handleLogout = session.handleLogout;
  const showError = session.showError;
  const showSuccess = session.showSuccess;
  const showWarning = session.showWarning;
  const requestedDay = searchParams.get("day");
  const requestedComposer = searchParams.get("composer");
  const requestedEditEntryId = searchParams.get("edit") ?? "";
  const todayDay = feedingTodayDayKey(timeZone);
  const lookbackDay = shiftFeedingDayKey(todayDay, -100);
  const maxDay = shiftFeedingDayKey(todayDay, 3);
  const birthDay = extractFeedingDayKey(activeBaby?.birthDate);
  const minDay = birthDay && birthDay >= lookbackDay && birthDay <= maxDay ? birthDay : lookbackDay;
  const selectedDay = clampFeedingDayKey(normalizeFeedingDayKey(requestedDay, timeZone), minDay, maxDay);
  const composerKind = isFeedingComposerKind(requestedComposer) ? requestedComposer : null;
  const isToday = isTodayFeedingDay(selectedDay, timeZone);
  const futureDay = isFutureFeedingDay(selectedDay, timeZone);
  const backPath = buildFeedingHubPath();
  const milkModeStorageKey = `${LAST_FEEDING_MILK_MODE_STORAGE_PREFIX}:${babyId}`;

  const [payload, setPayload] = useState<FeedingDayPayload>(EMPTY_DAY_PAYLOAD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeBreastTimer, setActiveBreastTimer] = useState<BreastFeedingTimerSession | null>(null);
  const [timerBusy, setTimerBusy] = useState(false);
  const [timerNow, setTimerNow] = useState(() => new Date());
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [preferredMilkMode, setPreferredMilkMode] = useState<FeedingMilkMode>(() => readStoredFeedingMilkMode(milkModeStorageKey));
  const [draft, setDraft] = useState<FeedingDraftState>(() => createInitialDraft("milk", feedingTodayDayKey(timeZone), true, readStoredFeedingMilkMode(milkModeStorageKey)));
  const timerReconnectRef = useRef<number | null>(null);
  const timerSessionSeenRef = useRef(false);
  const activeBreastTimerRef = useRef<BreastFeedingTimerSession | null>(null);

  const editingEntry = useMemo(
    () => payload.entries.find((entry) => entry.id === requestedEditEntryId) ?? null,
    [payload.entries, requestedEditEntryId]
  );
  const editorCategory = editingEntry?.category ?? composerKind;
  const editorOpen = Boolean(editorCategory);
  const summaryCards = useMemo(() => buildFeedingSummaryCards(payload.summary), [payload.summary]);
  const visibleActiveBreastTimer = activeBreastTimer && activeBreastTimer.dayKey === selectedDay ? activeBreastTimer : null;
  const effectivePreferredMilkMode = useMemo(
    () => latestRecordedMilkMode(payload.entries) ?? preferredMilkMode,
    [payload.entries, preferredMilkMode]
  );

  useEffect(() => {
    if (!canAccessFeeding(workspace.membership.role)) {
      router.replace(buildFeedingHubPath());
    }
  }, [router, workspace.membership.role]);

  useEffect(() => {
    if (requestedDay === selectedDay) {
      return;
    }
    startTransition(() => {
      router.replace(buildBabyFeedingPath(babyId, {
        day: selectedDay,
        composer: composerKind,
        editEntryId: requestedEditEntryId || undefined
      }), { scroll: false });
    });
  }, [babyId, composerKind, requestedDay, requestedEditEntryId, router, selectedDay]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function fetchDay() {
      try {
        const next = await loadFeedingDay(babyId, selectedDay);
        if (cancelled) {
          return;
        }
        setActiveBreastTimer(next.activeBreastTimer ?? null);
        setPayload(normalizeFeedingDayPayload(next));
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          await handleLogout();
          router.replace(buildAuthPath());
          return;
        }
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          router.replace(buildFeedingHubPath());
          return;
        }
        showError("加载失败", errorMessageFromUnknown(error, "喂养记录加载失败。"));
        setActiveBreastTimer(null);
        setPayload({ ...EMPTY_DAY_PAYLOAD, day: selectedDay });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchDay();
    return () => {
      cancelled = true;
    };
  }, [babyId, handleLogout, router, selectedDay, showError]);

  useEffect(() => {
    setPreferredMilkMode(readStoredFeedingMilkMode(milkModeStorageKey));
  }, [milkModeStorageKey]);

  useEffect(() => {
    activeBreastTimerRef.current = activeBreastTimer;
  }, [activeBreastTimer]);

  useEffect(() => {
    if (!editorCategory) {
      return;
    }
    setDraft(createInitialDraft(editorCategory, selectedDay, isToday, effectivePreferredMilkMode, editingEntry));
  }, [editingEntry, editorCategory, effectivePreferredMilkMode, isToday, selectedDay]);

  useEffect(() => {
    if (editorCategory !== "milk" || editingEntry || !activeBreastTimer) {
      return;
    }
    setDraft((current) => ({
      ...current,
      milkMode: "breast",
      breastTimingMode: "automatic",
      occurredAt: toDateTimeLocalValue(activeBreastTimer.startedAt)
    }));
  }, [activeBreastTimer, editingEntry, editorCategory]);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    setPanelExpanded(false);
  }, [editorOpen]);

  useEffect(() => {
    if (!requestedEditEntryId || loading || editingEntry) {
      return;
    }
    startTransition(() => {
      router.replace(buildBabyFeedingPath(babyId, { day: selectedDay }), { scroll: false });
    });
  }, [babyId, editingEntry, loading, requestedEditEntryId, router, selectedDay]);

  useEffect(() => {
    if (!activeBreastTimer) {
      return;
    }
    setTimerNow(new Date());
    const interval = window.setInterval(() => {
      setTimerNow(new Date());
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [activeBreastTimer]);

  useEffect(() => {
    let cancelled = false;
    let stream: EventSource | null = null;

    async function refreshCurrentDay() {
      try {
        const next = await loadFeedingDay(babyId, selectedDay);
        if (!cancelled) {
          setPayload(normalizeFeedingDayPayload(next));
          setActiveBreastTimer(next.activeBreastTimer ?? null);
        }
      } catch {
        // Ignore passive refresh failures.
      }
    }

    async function refreshTimerState() {
      try {
        const next = await loadFeedingTimer(babyId);
        if (!cancelled) {
          setActiveBreastTimer(next);
          setTimerNow(new Date());
        }
      } catch {
        // Ignore passive timer refresh failures.
      }
    }

    function scheduleReconnect() {
      if (cancelled || timerReconnectRef.current !== null) {
        return;
      }
      timerReconnectRef.current = window.setTimeout(() => {
        timerReconnectRef.current = null;
        if (!cancelled) {
          void refreshTimerState().finally(connect);
        }
      }, TIMER_RECONNECT_DELAY_MS);
    }

    function connect() {
      if (cancelled) {
        return;
      }
      stream = new EventSource(feedingTimerStreamUrl(babyId));
      stream.addEventListener("session", (event) => {
        if (cancelled) {
          return;
        }
        try {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { session?: BreastFeedingTimerSession | null };
          const nextSession = payload.session ?? null;
          const previousSession = activeBreastTimerRef.current;
          setActiveBreastTimer(nextSession);
          setTimerNow(new Date());
          if (previousSession && !nextSession) {
            void refreshCurrentDay();
          }
        } catch {
          // Ignore malformed events.
        }
      });
      stream.onerror = () => {
        stream?.close();
        stream = null;
        scheduleReconnect();
      };
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshTimerState();
      }
    };

    connect();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stream?.close();
      if (timerReconnectRef.current !== null) {
        window.clearTimeout(timerReconnectRef.current);
        timerReconnectRef.current = null;
      }
    };
  }, [babyId, selectedDay]);

  useEffect(() => {
    if (editorCategory === "milk" && !editingEntry && activeBreastTimer) {
      timerSessionSeenRef.current = true;
      return;
    }
    if (editorCategory === "milk" && !editingEntry && timerSessionSeenRef.current && !activeBreastTimer) {
      timerSessionSeenRef.current = false;
      navigate(selectedDay, { replace: true });
      return;
    }
    if (!editorOpen) {
      timerSessionSeenRef.current = false;
    }
  }, [activeBreastTimer, editingEntry, editorCategory, editorOpen, selectedDay]);

  function navigate(day: string, options?: { composer?: FeedingCategory | null; editEntryId?: string | null; replace?: boolean }) {
    const nextPath = buildBabyFeedingPath(babyId, {
      day,
      composer: options?.composer ?? undefined,
      editEntryId: options?.editEntryId ?? undefined
    });
    startTransition(() => {
      if (options?.replace) {
        router.replace(nextPath, { scroll: false });
        return;
      }
      router.push(nextPath, { scroll: false });
    });
  }

  function handleSelectDay(day: string) {
    navigate(day);
  }

  function handleBack() {
    startTransition(() => {
      router.push(backPath, { scroll: false });
    });
  }

  function handleOpenComposer(kind: FeedingCategory) {
    if (futureDay && !(kind === "milk" && activeBreastTimer)) {
      showWarning("暂不可记录", "未来日期只支持查看，不能新增记录。");
      return;
    }
    setPanelExpanded(false);
    if (kind === "milk" && activeBreastTimer) {
      navigate(activeBreastTimer.dayKey, { composer: "milk" });
      return;
    }
    navigate(selectedDay, { composer: kind });
  }

  function handleCloseEditor() {
    navigate(selectedDay, { replace: true });
  }

  function handleOpenActiveTimer() {
    if (!activeBreastTimer) {
      return;
    }
    navigate(activeBreastTimer.dayKey, { composer: "milk" });
  }

  function handleEditEntry(entryId: string) {
    setPanelExpanded(false);
    navigate(selectedDay, { editEntryId: entryId });
  }

  function updateDraft(patch: Partial<FeedingDraftState>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function addDraftItem() {
    setDraft((current) => ({ ...current, items: [...current.items, draftItem()] }));
  }

  function updateDraftItem(itemId: string, patch: Partial<FeedingDraftItem>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, ...patch } : item)
    }));
  }

  function removeDraftItem(itemId: string) {
    setDraft((current) => {
      const nextItems = current.items.filter((item) => item.id !== itemId);
      return { ...current, items: nextItems.length > 0 ? nextItems : [draftItem()] };
    });
  }

  function addPresetItem(name: string) {
    setDraft((current) => {
      if (current.items.some((item) => item.name.trim() === name)) {
        return current;
      }
      return { ...current, items: [...current.items, draftItem(name)] };
    });
  }

  function updatePayloadEntries(nextEntries: FeedingEntry[]) {
    setPayload((current) => ({
      ...current,
      entries: sortFeedingEntries(nextEntries),
      summary: buildFeedingSummary(nextEntries)
    }));
  }

  function rememberMilkMode(milkMode: FeedingMilkMode) {
    setPreferredMilkMode(milkMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(milkModeStorageKey, milkMode);
    }
  }

  async function handleTimerPrimaryAction(side: FeedingTimerSide) {
    const expectedVersion = activeBreastTimer?.version ?? 0;
    const action = !activeBreastTimer
      ? "start"
      : activeBreastTimer.status === "paused"
        ? "resume"
        : activeBreastTimer.activeSide === side
          ? "pause"
          : "switch";

    setTimerBusy(true);
    try {
      const next = await applyFeedingTimerAction(babyId, { action, side, expectedVersion });
      setActiveBreastTimer(next);
      setTimerNow(new Date());
      if (next) {
        setDraft((current) => ({
          ...current,
          milkMode: "breast",
          breastTimingMode: "automatic",
          occurredAt: toDateTimeLocalValue(next.startedAt)
        }));
        if (next.dayKey !== selectedDay || editorCategory !== "milk") {
          navigate(next.dayKey, { composer: "milk", replace: true });
        }
      }
    } catch (error) {
      if (error instanceof FeedingTimerConflictError) {
        setActiveBreastTimer(error.session);
        setTimerNow(new Date());
        showWarning("状态已更新", "亲喂计时已被其他家人更新，页面已同步到最新状态。");
        return;
      }
      showError("同步失败", errorMessageFromUnknown(error, "更新亲喂计时失败。"));
    } finally {
      setTimerBusy(false);
    }
  }

  async function handleCancelActiveTimer() {
    if (!activeBreastTimer) {
      return;
    }
    setTimerBusy(true);
    try {
      await applyFeedingTimerAction(babyId, {
        action: "cancel",
        expectedVersion: activeBreastTimer.version
      });
      setActiveBreastTimer(null);
      showSuccess("已取消计时", "本次亲喂计时已取消。");
      navigate(selectedDay, { replace: true });
    } catch (error) {
      if (error instanceof FeedingTimerConflictError) {
        setActiveBreastTimer(error.session);
        showWarning("状态已更新", "计时状态已被其他家人更新。");
        return;
      }
      showError("取消失败", errorMessageFromUnknown(error, "取消亲喂计时失败。"));
    } finally {
      setTimerBusy(false);
    }
  }

  async function handleFinishActiveTimer() {
    if (!activeBreastTimer) {
      return;
    }
    setTimerBusy(true);
    try {
      const saved = await finishFeedingTimer(babyId, {
        expectedVersion: activeBreastTimer.version,
        note: draft.note
      });
      rememberMilkMode("breast");
      const nextDay = saved.dayKey || activeBreastTimer.dayKey;
      if (nextDay === selectedDay) {
        updatePayloadEntries([saved, ...payload.entries]);
      }
      setActiveBreastTimer(null);
      showSuccess("已保存记录", "亲喂记录已保存。");
      navigate(nextDay, { replace: true });
    } catch (error) {
      if (error instanceof FeedingTimerConflictError) {
        setActiveBreastTimer(error.session);
        showWarning("状态已更新", "计时状态已被其他家人更新，页面已同步到最新状态。");
        return;
      }
      showError("保存失败", errorMessageFromUnknown(error, "保存亲喂计时失败。"));
    } finally {
      setTimerBusy(false);
    }
  }

  async function handleSave() {
    if (!editorCategory) {
      return;
    }
    if (!canSubmitDraft(editorCategory, draft, editingEntry)) {
      showWarning("请补充信息", "还有必填项没有填写完整。");
      return;
    }

    setSaving(true);
    try {
      const input = buildEntryPayload(editorCategory, draft, editingEntry);
      const saved = editingEntry
        ? await updateFeedingEntry(babyId, editingEntry.id, input)
        : await createFeedingEntry(babyId, input);
      if (saved.category === "milk" && saved.milkMode) {
        rememberMilkMode(saved.milkMode);
      }
      const nextDay = saved.dayKey || selectedDay;
      if (nextDay === selectedDay) {
        updatePayloadEntries(
          editingEntry
            ? payload.entries.map((entry) => entry.id === saved.id ? saved : entry)
            : [saved, ...payload.entries]
        );
      }
      showSuccess(editingEntry ? "已更新记录" : "已保存记录", editingEntry ? "喂养记录已更新。" : "喂养记录已保存。");
      navigate(nextDay, { replace: true });
    } catch (error) {
      showError("保存失败", errorMessageFromUnknown(error, "保存喂养记录失败。"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingEntry) {
      return;
    }
    setDeleting(true);
    try {
      await deleteFeedingEntry(babyId, editingEntry.id);
      updatePayloadEntries(payload.entries.filter((entry) => entry.id !== editingEntry.id));
      showSuccess("已删除记录", "这条喂养记录已移除。");
      navigate(selectedDay, { replace: true });
    } catch (error) {
      showError("删除失败", errorMessageFromUnknown(error, "删除喂养记录失败。"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <section className={`pageStack feedingPage tabSection tabSectionActive${panelExpanded ? " feedingPageDockExpanded" : ""}`}>
        <header className="feedingTopBar">
          <button className="draftTopAction feedingTopBarBack" onClick={handleBack} type="button">返回</button>
          <h1>喂养记录</h1>
          <span className="feedingTopBarSpacer" />
        </header>

        <FeedingDateStrip maxDay={maxDay} minDay={minDay} onSelect={handleSelectDay} selectedDay={selectedDay} todayDay={todayDay} />

        {!loading && summaryCards.length > 0 ? (
          <article className="panel panelStack feedingSummaryPanel">
            <header className="feedingSummaryHeader">
              <BabyAvatar albumId={workspace.album.id} baby={activeBaby} className="feedingSummaryAvatar" />
              <div className="feedingSummaryIdentity">
                <div className="feedingSummaryIdentityRow">
                  <strong>{activeBaby?.name ?? workspace.album.name}</strong>
                </div>
                <p>{activeBaby?.birthDate ? `${formatDate(activeBaby.birthDate)} · ${formatFeedingAgeForDayKey(activeBaby.birthDate, selectedDay)}` : "还没有填写出生日期"}</p>
              </div>
            </header>
            <div className="feedingSummaryGrid">
              {summaryCards.map((card) => (
                <div className="feedingSummaryCard" key={card.key}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  {card.detail ? <p>{card.detail}</p> : null}
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {loading ? <FeedingContentLoadingSkeleton ariaLabel="正在加载喂养记录" /> : (
          <FeedingTimeline
            activeBreastTimer={visibleActiveBreastTimer}
            entries={payload.entries}
            onEdit={handleEditEntry}
            onOpenActiveTimer={handleOpenActiveTimer}
            showRelativeTime={isToday}
            timeZone={timeZone}
          />
        )}
      </section>

      {!editorOpen ? (
        <div className="feedingActionDockLayer">
          <FeedingActionDock
            disabled={futureDay && !activeBreastTimer}
            expanded={panelExpanded}
            onSelect={handleOpenComposer}
            onToggle={() => setPanelExpanded((current) => !current)}
          />
        </div>
      ) : null}

      {editorOpen && editorCategory ? (
        <FeedingEditorSheet
          activeBreastTimer={activeBreastTimer}
          category={editorCategory}
          deleting={deleting}
          draft={draft}
          editingEntry={editingEntry}
          onCancelActiveTimer={() => void handleCancelActiveTimer()}
          onAddItem={addDraftItem}
          onAddPreset={addPresetItem}
          onChange={updateDraft}
          onClose={handleCloseEditor}
          onDelete={() => void handleDelete()}
          onFinishActiveTimer={() => void handleFinishActiveTimer()}
          onOpenActiveTimerDay={handleOpenActiveTimer}
          onTimerPrimaryAction={(side) => void handleTimerPrimaryAction(side)}
          onRemoveItem={removeDraftItem}
          onSave={() => void handleSave()}
          onUpdateItem={updateDraftItem}
          saving={saving}
          timerBusy={timerBusy}
          timerNow={timerNow}
          timeZone={timeZone}
        />
      ) : null}
    </>
  );
}
