import type { StorageStatus } from "../app-shell/model/types";

interface StorageStatusChipProps {
  status: StorageStatus;
  large?: boolean;
}

export function StorageStatusChip({ status, large }: StorageStatusChipProps) {
  const suffix = status === "online" ? "Online" : status === "offline" ? "Offline" : status === "pairing" ? "Pending" : "Idle";
  const label = status === "online" ? "在线" : status === "offline" ? "离线" : status === "pairing" ? "待配对" : "未接入";
  return <span className={`settingsStatusChip${large ? " settingsStatusChipLarge" : ""} settingsStatusChip${suffix}`}>{label}</span>;
}
