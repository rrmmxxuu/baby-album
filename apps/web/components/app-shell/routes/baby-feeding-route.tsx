"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, createFeedingEntry, deleteFeedingEntry, loadFeedingDay, updateFeedingEntry } from "../../../lib/api";
import type { FeedingCategory, FeedingDayPayload, FeedingEntry, FeedingEntryItemInput, FeedingEntryUpsertInput, FeedingMilkMode } from "../../../lib/types";
import { useBabyRouteContext } from "../baby-route-context";
import { canAccessFeeding, feedingBabySummaries } from "../model/babies";
import {
  buildFeedingSummary,
  buildFeedingDayStrip,
  buildFeedingSummaryCards,
  clampFeedingDayKey,
  extractFeedingDayKey,
  FEEDING_DOSE_UNITS,
  feedingEntryDetail,
  feedingEntryHeadline,
  feedingTodayDayKey,
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
import { buildAuthPath, buildBabyFeedingPath, buildFeedingHubPath, buildPhotosHubPath } from "../model/routes";
import { BabyAvatar } from "../ui/baby-avatar";
import { PanelMessage } from "../../ui/panel-message";

const LAST_FEEDING_MILK_MODE_STORAGE_PREFIX = "baby-album.lastFeedingMilkMode";

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
  entries: FeedingEntry[];
  showRelativeTime: boolean;
  timeZone: string;
  onEdit: (entryId: string) => void;
}

interface FeedingActionDockProps {
  disabled: boolean;
  expanded: boolean;
  onSelect: (kind: FeedingCategory) => void;
  onToggle: () => void;
}

interface FeedingEditorSheetProps {
  category: FeedingCategory;
  deleting: boolean;
  draft: FeedingDraftState;
  editingEntry: FeedingEntry | null;
  onAddItem: () => void;
  onAddPreset: (name: string) => void;
  onChange: (patch: Partial<FeedingDraftState>) => void;
  onClose: () => void;
  onDelete: () => void;
  onRemoveItem: (itemId: string) => void;
  onSave: () => void;
  onUpdateItem: (itemId: string, patch: Partial<FeedingDraftItem>) => void;
  saving: boolean;
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

function createInitialDraft(category: FeedingCategory, selectedDay: string, isToday: boolean, preferredMilkMode: FeedingMilkMode, entry?: FeedingEntry | null): FeedingDraftState {
  if (entry) {
    return {
      occurredAt: toDateTimeLocalValue(entry.occurredAt),
      endedAt: defaultEndedAtForPendingEntry(category, entry),
      note: entry.note ?? "",
      milkMode: entry.milkMode ?? "formula",
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

function buildEntryPayload(category: FeedingCategory, draft: FeedingDraftState): FeedingEntryUpsertInput {
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

function canSubmitDraft(category: FeedingCategory, draft: FeedingDraftState) {
  if (!draft.occurredAt) {
    return false;
  }
  switch (category) {
    case "milk":
      if (draft.milkMode === "breast") {
        return true;
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

function FeedingTimeline({ entries, showRelativeTime, timeZone, onEdit }: FeedingTimelineProps) {
  if (entries.length === 0) {
    return <PanelMessage message="这一天还没有喂养记录。" />;
  }

  return (
    <div className="feedingTimeline">
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
  category,
  deleting,
  draft,
  editingEntry,
  onAddItem,
  onAddPreset,
  onChange,
  onClose,
  onDelete,
  onRemoveItem,
  onSave,
  onUpdateItem,
  saving
}: FeedingEditorSheetProps) {
  const presets = categoryPresets(category);
  const canDelete = Boolean(editingEntry);
  const [doseDialogItemId, setDoseDialogItemId] = useState("");
  const [doseAmount, setDoseAmount] = useState("");
  const [doseUnit, setDoseUnit] = useState("");

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

  const itemFieldLabel = category === "supplement" ? "记录营养品" : "记录药品";

  return (
    <div className="draftSheetOverlay draftSheetOverlayOpen" role="presentation">
      <section aria-modal="true" className="draftSheet draftSheetOpen feedingSheet" role="dialog">
        <header className="draftSheetHeader">
          <button className="draftTopAction" onClick={onClose} type="button">取消</button>
          <h2>{editorTitle(category, canDelete)}</h2>
          <button className="draftTopPrimary" disabled={saving} onClick={onSave} type="button">{saving ? "保存中" : "保存"}</button>
        </header>

        <div className="draftPage feedingSheetBody">
          <div className="panel panelStack feedingEditorPanel">
            {(category === "milk" || category === "solid" || category === "diaper" || category === "sleep" || category === "supplement" || category === "medicine") ? (
              <div className="feedingEditorFields">
                {category === "milk" ? (
                  <div className="feedingSegmentGroup">
                    <span className="feedingFieldLabel">喂奶方式</span>
                    <div aria-label="喂奶方式" className="segmentedControl feedingSegmentedControl feedingSegmentedControlThree" role="tablist">
                      <button className={`segmentedControlButton${draft.milkMode === "breast" ? " segmentedControlButtonActive" : ""}`} onClick={() => onChange({ milkMode: "breast" })} type="button">亲喂</button>
                      <button className={`segmentedControlButton${draft.milkMode === "bottle" ? " segmentedControlButtonActive" : ""}`} onClick={() => onChange({ milkMode: "bottle" })} type="button">瓶喂</button>
                      <button className={`segmentedControlButton${draft.milkMode === "formula" ? " segmentedControlButtonActive" : ""}`} onClick={() => onChange({ milkMode: "formula" })} type="button">配方奶</button>
                    </div>
                  </div>
                ) : null}

                <label>
                  记录时间
                  <input onChange={(event) => onChange({ occurredAt: event.target.value })} type="datetime-local" value={draft.occurredAt} />
                </label>

                {category === "milk" && draft.milkMode === "breast" ? (
                  <label>
                    结束时间
                    <input onChange={(event) => onChange({ endedAt: event.target.value })} type="datetime-local" value={draft.endedAt} />
                  </label>
                ) : null}

                {category === "sleep" ? (
                  <label>
                    睡醒时间
                    <input onChange={(event) => onChange({ endedAt: event.target.value })} type="datetime-local" value={draft.endedAt} />
                  </label>
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
        </div>

        <footer className="draftSheetFooter">
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
  const feedingBabies = useMemo(() => feedingBabySummaries(session.appState?.albums ?? []), [session.appState?.albums]);
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
  const backPath = feedingBabies.length > 1 ? buildFeedingHubPath() : buildPhotosHubPath();
  const milkModeStorageKey = `${LAST_FEEDING_MILK_MODE_STORAGE_PREFIX}:${babyId}`;

  const [payload, setPayload] = useState<FeedingDayPayload>(EMPTY_DAY_PAYLOAD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [preferredMilkMode, setPreferredMilkMode] = useState<FeedingMilkMode>(() => readStoredFeedingMilkMode(milkModeStorageKey));
  const [draft, setDraft] = useState<FeedingDraftState>(() => createInitialDraft("milk", feedingTodayDayKey(timeZone), true, readStoredFeedingMilkMode(milkModeStorageKey)));

  const editingEntry = useMemo(
    () => payload.entries.find((entry) => entry.id === requestedEditEntryId) ?? null,
    [payload.entries, requestedEditEntryId]
  );
  const editorCategory = editingEntry?.category ?? composerKind;
  const editorOpen = Boolean(editorCategory);
  const summaryCards = useMemo(() => buildFeedingSummaryCards(payload.summary), [payload.summary]);

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
    if (!editorCategory) {
      return;
    }
    setDraft(createInitialDraft(editorCategory, selectedDay, isToday, preferredMilkMode, editingEntry));
  }, [editingEntry, editorCategory, isToday, preferredMilkMode, selectedDay]);

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
    if (futureDay) {
      showWarning("暂不可记录", "未来日期只支持查看，不能新增记录。");
      return;
    }
    setPanelExpanded(false);
    navigate(selectedDay, { composer: kind });
  }

  function handleCloseEditor() {
    navigate(selectedDay, { replace: true });
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

  async function handleSave() {
    if (!editorCategory) {
      return;
    }
    if (!canSubmitDraft(editorCategory, draft)) {
      showWarning("请补充信息", "还有必填项没有填写完整。");
      return;
    }

    setSaving(true);
    try {
      const input = buildEntryPayload(editorCategory, draft);
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
          <h1>喂养</h1>
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

        {loading ? <PanelMessage message="正在加载喂养记录..." /> : <FeedingTimeline entries={payload.entries} onEdit={handleEditEntry} showRelativeTime={isToday} timeZone={timeZone} />}
      </section>

      {!editorOpen ? (
        <div className="feedingActionDockLayer">
          <FeedingActionDock
            disabled={futureDay}
            expanded={panelExpanded}
            onSelect={handleOpenComposer}
            onToggle={() => setPanelExpanded((current) => !current)}
          />
        </div>
      ) : null}

      {editorOpen && editorCategory ? (
        <FeedingEditorSheet
          category={editorCategory}
          deleting={deleting}
          draft={draft}
          editingEntry={editingEntry}
          onAddItem={addDraftItem}
          onAddPreset={addPresetItem}
          onChange={updateDraft}
          onClose={handleCloseEditor}
          onDelete={() => void handleDelete()}
          onRemoveItem={removeDraftItem}
          onSave={() => void handleSave()}
          onUpdateItem={updateDraftItem}
          saving={saving}
        />
      ) : null}
    </>
  );
}
