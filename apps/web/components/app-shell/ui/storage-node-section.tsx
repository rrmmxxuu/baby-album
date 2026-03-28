import type { StorageNode } from "../../../lib/types";
import { formatBytes, formatDateTime } from "../model/format";
import { StorageSection } from "../../ui/storage-section";

interface StorageNodeSectionProps {
  storageNode: StorageNode | null;
}

export function StorageNodeSection({ storageNode }: StorageNodeSectionProps) {
  return (
    <StorageSection subtitle={storageNode ? storageNode.name : "还没有接入储存设备"} title="当前主节点">
      {storageNode ? (
        <>
          <div className="storageNodeHeader">
            <div>
              <div className="storageNodeStatusRow">
                <span className={`storageNodeDot ${storageNode.status === "online" ? "storageNodeDotOnline" : "storageNodeDotOffline"}`} />
                <span className="storageNodeStatusLabel">{storageNode.status === "online" ? "在线，正在处理新内容" : "离线，恢复后会继续处理"}</span>
              </div>
              <p className="helperText storageNodeHeartbeat">最近心跳：{formatDateTime(storageNode.lastSeenAt)}</p>
            </div>
          </div>
          <div className="summaryGrid storageMetricsGrid">
            <article className="metricCard">
              <span>可用空间</span>
              <strong>{formatBytes(storageNode.availableBytes)}</strong>
            </article>
            <article className="metricCard">
              <span>总容量</span>
              <strong>{formatBytes(storageNode.totalBytes)}</strong>
            </article>
          </div>
          <div className="storageInfoList">
            <p className="storageInfoItem">上传会先进入云端原始存储，再由当前主节点处理预览和本地落盘。</p>
            <p className="storageInfoItem">{storageNode.status === "online" ? "当前节点在线，新的照片和视频会正常进入处理链路。" : "当前节点离线时仍可保留已有内容浏览；新上传内容会在节点恢复后继续处理。"}</p>
          </div>
        </>
      ) : (
        <div className="storageEmptyState">
          <strong>还没有接入储存设备</strong>
          <p className="helperText">完成首次配对后，这个相册才会开始处理照片和视频上传。</p>
        </div>
      )}
    </StorageSection>
  );
}
