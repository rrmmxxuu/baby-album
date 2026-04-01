import type { AlbumInvite, AlbumMember, AlbumWorkspace, BabyProfile, Role, StorageNode, StorageNodePairing, User } from "../../../lib/types";
import type { NavDirection, StorageStatus } from "./types";

export interface AppShellViewModel {
  activeBaby: BabyProfile | null;
  albumMembers: AlbumMember[];
  albumInvites: AlbumInvite[];
  storageNode: StorageNode | null;
  canManageInvites: boolean;
  canManageBabyProfile: boolean;
  canManageStorage: boolean;
  canUploadMedia: boolean;
  transferCandidates: AlbumMember[];
  activeStoragePairing: StorageNodePairing | null;
  storageStatus: StorageStatus;
  storageStatusSummary: string;
  storageFlowTitle: string;
  storageUploadSummary: string;
  storagePairingModeLabel: string;
  storagePairingActionLabel: string;
  settingsSceneClassName: string;
}

interface BuildAppShellViewModelOptions {
  activeAlbum: AlbumWorkspace | null;
  currentUser: User | null;
  settingsNavDirection: NavDirection;
  storagePairing: StorageNodePairing | null;
}

function canManageRole(role?: Role) {
  return role === "owner" || role === "admin";
}

export function buildAppShellViewModel({ activeAlbum, currentUser, settingsNavDirection, storagePairing }: BuildAppShellViewModelOptions): AppShellViewModel {
  const activeBaby = activeAlbum?.baby ?? activeAlbum?.babies?.[0] ?? null;
  const albumMembers = activeAlbum?.members ?? [];
  const albumInvites = (activeAlbum?.invites ?? []).filter((item) => item.status === "pending");
  const storageNode = activeAlbum?.storageNode ?? null;
  const canManageInvites = canManageRole(activeAlbum?.membership.role);
  const canManageBabyProfile = canManageRole(activeAlbum?.membership.role);
  const canManageStorage = activeAlbum?.membership.role === "owner";
  const canUploadMedia = Boolean(activeAlbum && activeAlbum.membership.role !== "viewer" && storageNode);
  const transferCandidates = albumMembers.filter((member) => member.userId !== currentUser?.id);
  const activeStoragePairing = storagePairing && storagePairing.albumId === activeAlbum?.album.id ? storagePairing : null;
  const storageStatus: StorageStatus = activeStoragePairing ? "pairing" : storageNode ? storageNode.status : "unpaired";
  const storageStatusSummary = activeStoragePairing
    ? `配对码待使用，${new Date(activeStoragePairing.expiresAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })} 前有效`
    : storageNode
      ? storageNode.status === "online"
        ? `${storageNode.name} 在线，可继续处理新上传内容`
        : `${storageNode.name} 当前离线，恢复后会继续处理媒体`
      : canManageStorage
        ? "尚未接入储存设备，完成首次配对后即可上传和处理媒体"
        : "尚未接入储存设备，请联系创建者完成首次配对";

  return {
    activeBaby,
    albumMembers,
    albumInvites,
    storageNode,
    canManageInvites,
    canManageBabyProfile,
    canManageStorage,
    canUploadMedia,
    transferCandidates,
    activeStoragePairing,
    storageStatus,
    storageStatusSummary,
    storageFlowTitle: storageNode ? "更换、接回或补配储存设备" : "接入第一台储存设备",
    storageUploadSummary: !storageNode
      ? "暂不可上传"
      : storageNode.status === "online"
        ? "可正常上传并处理"
        : "可继续上传，处理会在节点恢复后继续",
    storagePairingModeLabel: storageNode ? "替换主节点" : "首次接入",
    storagePairingActionLabel: storageNode ? "生成替换码" : "生成配对码",
    settingsSceneClassName: `panelStack settingsDetailPage settingsScene ${settingsNavDirection === "forward" ? "settingsSceneForward" : "settingsSceneBack"}`
  };
}
